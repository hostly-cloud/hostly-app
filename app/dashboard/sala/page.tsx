"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { useAuth } from "@/components/auth/auth-context"
import { db } from "@/lib/firebase/client"
import {
  advanceKdsLineViaApi,
  orderItemsUiStatusToOrdersExpected,
  resolveOrderItemLineId,
} from "@/lib/kds/advance-kds-line-via-api"

function tableKeyFromItem(item: any): string {
  return String(item.tableNumber || item.tableName || "Sin mesa")
}

function groupByTable(items: any[]) {
  return items.reduce<Record<string, any[]>>((acc, item) => {
    const table = tableKeyFromItem(item)
    if (!acc[table]) acc[table] = []
    acc[table].push(item)
    return acc
  }, {})
}

function getOldestReadyAt(items: any[]) {
  return items.reduce((oldest, item) => {
    const value = item.readyAt || item.updatedAt || Date.now()
    return value < oldest ? value : oldest
  }, Date.now())
}

function getElapsedMinutes(timestamp: number) {
  return Math.floor((Date.now() - timestamp) / 60000)
}

function getSalaUrgencyClass(minutes: number) {
  if (minutes >= 10) return "bg-red-100 text-red-700"
  if (minutes >= 5) return "bg-orange-100 text-orange-700"
  return "bg-green-100 text-green-700"
}

export default function SalaPage() {
  const { restaurantId, ready } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [locallyServedIds, setLocallyServedIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [lastServed, setLastServed] = useState<string[] | null>(null)
  const [completedTableMessage, setCompletedTableMessage] = useState<string | null>(null)
  const [completingTableIds, setCompletingTableIds] = useState<Set<string>>(
    () => new Set(),
  )
  const soundRef = useRef<HTMLAudioElement | null>(null)
  const prevIdsRef = useRef<string[]>([])
  const hasLoadedOnceRef = useRef(false)
  const prevVisibleTableIdsRef = useRef<string[]>([])
  const isFirstRenderRef = useRef(true)
  const isUndoingRef = useRef(false)
  const processedCompletedTablesRef = useRef<Set<string>>(new Set())

  const visibleItems = useMemo(
    () => items.filter(item => !locallyServedIds.has(item.id)),
    [items, locallyServedIds],
  )

  const groupedItems = useMemo(() => groupByTable(visibleItems), [visibleItems])

  const visibleTableIds = useMemo(
    () => Object.keys(groupedItems).sort(),
    [groupedItems],
  )

  const sortedGroupedItems = useMemo(
    () =>
      Object.entries(groupedItems).sort(
        (a, b) => getOldestReadyAt(a[1]) - getOldestReadyAt(b[1]),
      ),
    [groupedItems],
  )

  const completingGhostKeys = useMemo(() => {
    const keys = Object.keys(groupedItems)
    return [...completingTableIds].filter(k => !keys.includes(k))
  }, [completingTableIds, groupedItems])

  useEffect(() => {
    if (!ready || !restaurantId) return

    const q = query(
      collection(db, "orderItems"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "ready")
    )

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setItems(data)
    })

    return () => unsub()
  }, [ready, restaurantId])

  useEffect(() => {
    soundRef.current = new Audio("/sounds/ready.mp3")
  }, [])

  useEffect(() => {
    const currentIds = visibleItems.map(i => i.id)
    if (!hasLoadedOnceRef.current) {
      prevIdsRef.current = currentIds
      hasLoadedOnceRef.current = true
      return
    }

    const newItems = currentIds.filter(id => !prevIdsRef.current.includes(id))
    if (newItems.length > 0 && soundRef.current) {
      soundRef.current.currentTime = 0
      soundRef.current.play().catch(() => {})
    }
    prevIdsRef.current = currentIds
  }, [visibleItems])

  const serveLegacyOrderItem = async (item: any) => {
    const orderId = typeof item.orderId === "string" ? item.orderId.trim() : ""
    if (!orderId) {
      return { ok: false as const, error: "ORDER_ID_REQUIRED" }
    }
    return advanceKdsLineViaApi({
      orderId,
      lineId: resolveOrderItemLineId(item),
      expectedStatus: orderItemsUiStatusToOrdersExpected(item.status),
      nextStatus: "served",
      quantity: 1,
    })
  }

  const handleMarkServed = async (itemId: string) => {
    const visibleNow = items.filter(item => !locallyServedIds.has(item.id))
    const target = visibleNow.find(i => i.id === itemId)
    const tableKey = target ? tableKeyFromItem(target) : ""
    const sameTable = visibleNow.filter(i => tableKeyFromItem(i) === tableKey)
    const isLastOnTable =
      Boolean(target) && sameTable.length === 1 && sameTable[0]?.id === itemId

    const scheduleClearCompleting = (tk: string) => {
      window.setTimeout(() => {
        setCompletingTableIds(prev => {
          const next = new Set(prev)
          next.delete(tk)
          return next
        })
      }, 280)
    }

    try {
      if (!target) return
      if (isLastOnTable && tableKey) {
        setCompletingTableIds(prev => new Set(prev).add(tableKey))
        scheduleClearCompleting(tableKey)
      }
      setLocallyServedIds(prev => new Set(prev).add(itemId))
      setLastServed([itemId])
      const result = await serveLegacyOrderItem(target)
      if (!result.ok) {
        throw new Error(result.error)
      }
      setActionSuccess("Item servido")
      setTimeout(() => setActionSuccess(null), 1500)
    } catch (e) {
      console.error("handleMarkServed", e)
      if (isLastOnTable && tableKey) {
        setCompletingTableIds(prev => {
          const next = new Set(prev)
          next.delete(tableKey)
          return next
        })
      }
      setActionError("No se pudo marcar como servido. Inténtalo otra vez.")
      setTimeout(() => setActionError(null), 3000)
      setLocallyServedIds(prev => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleServeTable = async (tableItems: any[]) => {
    if (tableItems.length >= 5) {
      const confirmServe = window.confirm(
        `Vas a marcar ${tableItems.length} items como servidos. ¿Confirmar?`
      )
      if (!confirmServe) return
    }
    const tableKey = tableItems[0] ? tableKeyFromItem(tableItems[0]) : ""
    try {
      if (tableKey) {
        setCompletingTableIds(prev => new Set(prev).add(tableKey))
        window.setTimeout(() => {
          setCompletingTableIds(prev => {
            const next = new Set(prev)
            next.delete(tableKey)
            return next
          })
        }, 280)
      }
      setLastServed(tableItems.map(i => i.id))
      const results = await Promise.all(
        tableItems.map(item => serveLegacyOrderItem(item))
      )
      if (results.some(r => !r.ok)) {
        throw new Error("SERVE_TABLE_PARTIAL_FAIL")
      }
      setActionSuccess("Mesa servida")
      setTimeout(() => setActionSuccess(null), 1500)
    } catch (e) {
      console.error("handleServeTable", e)
      if (tableKey) {
        setCompletingTableIds(prev => {
          const next = new Set(prev)
          next.delete(tableKey)
          return next
        })
      }
      setActionError("No se pudo servir la mesa. Inténtalo otra vez.")
      setTimeout(() => setActionError(null), 3000)
    }
  }

  const handleUndoServed = async () => {
    if (!lastServed) return
    // Retroceso served→ready no está en el lifecycle autoritativo.
    isUndoingRef.current = false
    setActionError("Deshacer no disponible")
    setTimeout(() => setActionError(null), 3000)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault()
        handleUndoServed()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [lastServed])

  useEffect(() => {
    if (isFirstRenderRef.current) {
      prevVisibleTableIdsRef.current = [...visibleTableIds]
      isFirstRenderRef.current = false
      return
    }

    const mesasPrevias = prevVisibleTableIdsRef.current
    const mesasActuales = visibleTableIds
    for (const id of mesasActuales) {
      processedCompletedTablesRef.current.delete(id)
    }
    const removedTables = mesasPrevias.filter(id => !mesasActuales.includes(id))

    if (!isUndoingRef.current && removedTables.length > 0) {
      for (const tableId of removedTables) {
        if (!processedCompletedTablesRef.current.has(tableId)) {
          processedCompletedTablesRef.current.add(tableId)
          setCompletedTableMessage(`Mesa ${tableId} servida completamente`)
          break
        }
      }
    }

    prevVisibleTableIdsRef.current = [...visibleTableIds]
    if (isUndoingRef.current) isUndoingRef.current = false
  }, [visibleTableIds])

  useEffect(() => {
    if (!completedTableMessage) return
    const t = window.setTimeout(() => setCompletedTableMessage(null), 2500)
    return () => clearTimeout(t)
  }, [completedTableMessage])

  return (
    <div className="relative p-4">
      {completedTableMessage ? (
        <div
          className="pointer-events-none fixed left-1/2 top-3 z-50 max-w-[min(92vw,24rem)] -translate-x-1/2 rounded-lg border border-blue-500 bg-blue-100 px-3 py-2 text-center text-xs font-bold text-blue-700 shadow-md sm:text-sm"
          role="status"
        >
          {completedTableMessage}
        </div>
      ) : null}
      <h1 className="text-lg font-bold mb-4">Sala</h1>
      {lastServed && (
        <button
          onClick={handleUndoServed}
          className="mb-3 px-3 py-1 text-xs bg-gray-800 text-white rounded"
        >
          Deshacer último servido
        </button>
      )}
      {actionError && (
        <div className="mb-3 rounded border border-red-500 bg-red-100 px-3 py-2 text-sm font-bold text-red-700">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="mb-3 rounded border border-green-500 bg-green-100 px-3 py-2 text-sm font-bold text-green-700">
          {actionSuccess}
        </div>
      )}

      {visibleItems.length === 0 && completingTableIds.size === 0 && (
        <div className="text-gray-500">Nada listo para servir</div>
      )}

      <div className="grid gap-3">
        {sortedGroupedItems.map(([table, tableItems]) => {
          const oldestReadyAt = getOldestReadyAt(tableItems)
          const elapsedMinutes = getElapsedMinutes(oldestReadyAt)
          const isCompleting =
            completingTableIds.has(table) && tableItems.length === 1

          return (
            <div
              key={table}
              className={`border rounded p-3 bg-white shadow transition-opacity duration-200 ${
                isCompleting ? "opacity-60 ring-2 ring-green-400/70" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-bold">
                  Mesa {table} ({tableItems.length}){" "}
                  <span
                    className={`text-xs px-2 py-1 rounded ${getSalaUrgencyClass(
                      elapsedMinutes,
                    )}`}
                  >
                    {elapsedMinutes} min
                  </span>
                </div>

                <button
                  onClick={() => handleServeTable(tableItems)}
                  className="px-3 py-1 text-xs bg-green-700 text-white rounded"
                >
                  Servir todo
                </button>
              </div>
              <div className="grid gap-2">
                {tableItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleMarkServed(item.id)}
                    className="border rounded p-2 cursor-pointer hover:bg-green-50"
                  >
                    <div className="text-sm">
                      {item.name} x{item.quantity}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMarkServed(item.id)
                      }}
                      className="mt-2 px-3 py-1 text-sm bg-green-600 text-white rounded"
                    >
                      Servido
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {completingGhostKeys.map(table => (
          <div
            key={`ghost-${table}`}
            className="pointer-events-none border rounded p-3 bg-white shadow opacity-60 ring-2 ring-green-400/70 transition-opacity duration-200"
            aria-hidden
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-slate-600">Mesa {table}</div>
            </div>
            <div className="text-xs text-slate-500">Sirviendo…</div>
          </div>
        ))}
      </div>
    </div>
  )
}


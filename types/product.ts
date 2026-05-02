export type Product = {
  id: string;
  nombre: string;
  categoria: string;
  /** Id del documento de categoría en Firestore, si existe en el documento. */
  categoryId?: string;
  precio: number;
  /** Área operativa donde se prepara el producto (p. ej. cocina, barra, cocteleria). */
  preparationArea?: string;
  createdAt?: number;
  /** Dueño del documento en Firestore (Firebase Auth uid). */
  userId?: string;
  /** Restaurante / tenant; por ahora coincide con el uid del dueño. */
  restaurantId?: string;
  imageUrl?: string;
  imagePath?: string;
};

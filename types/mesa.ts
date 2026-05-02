export type Mesa = {
  id: string;
  restaurantId: string;

  name: string;
  zone: string;

  capacity: number;

  status: "free" | "occupied" | "reserved";

  createdAt: number;
  updatedAt: number;
};

export type MesaStatus = Mesa["status"];

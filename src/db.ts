import mongoose from "mongoose";

export async function connectDb(uri = process.env.MONGODB_URI!) {
  if (!uri) throw new Error("Falta MONGODB_URI");
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri);
  return mongoose;
}

export async function pingDb() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo no conectado");
  await db.admin().command({ ping: 1 });
}

import { DataSource } from "typeorm";
import { Club } from "../models/club.entity";

const DATA_BASE = process.env.DATA_BASE || '/team-matches.sqlite';

let connection: DataSource;

export const connectDatabase = async (database?: string) => {
    if (connection) {
      return connection;
    }

    try {
      const AppDataSource = new DataSource({
        type: "sqlite",
        database: database || DATA_BASE,
        entities: [Club],
        synchronize: true,
        logging: false
      })

        connection = await AppDataSource.initialize();
        console.log("Connected to SQLite database");
        return connection;
    } catch (error) {
        console.error("Error connecting to database:", error);
        throw error;
    }
};

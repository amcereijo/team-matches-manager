import 'reflect-metadata';
import app from './app';
import { connectDatabase } from './config/db';

const port = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDatabase();
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();

import express, { Request, Response } from 'express';
import { getClubs } from './services/club/club.service';

const app = express();

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Hello, World!' });
});

app.get('/clubs', async (req: Request, res: Response) => {
  try {
    const clubs = await getClubs()
    res.json(clubs);
  } catch (error) {
    console.error("Error fetching clubs:", error);
    res.status(500).json({ message: "Error fetching clubs" });
  }
});

export default app;

import "dotenv/config";
import "./types";
import express from "express";
import cors from "cors";
import { createServer } from "http";

import authRoutes from "./routes/auth.routes";
import jobsRoutes from "./routes/jobs.routes";
import candidatesRoutes from "./routes/candidates.routes";
import interviewsRoutes from "./routes/interviews.routes";
import offersRoutes from "./routes/offers.routes";
import usersRoutes from "./routes/users.routes";
import searchRoutes from "./routes/search.routes";
import notificationsRoutes from "./routes/notifications.routes";
import featureFlagsRoutes from "./routes/featureFlags.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import actionsRoutes from "./routes/actions.routes";
import importRoutes from "./routes/import.routes";
import conversationsRoutes from "./routes/conversations.routes";
import skillsRoutes from "./routes/skills.routes";
import { attachWebSocketServer } from "./lib/websocket";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:3000" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/jobs", jobsRoutes);
app.use("/candidates", candidatesRoutes);
app.use("/interviews", interviewsRoutes);
app.use("/offers", offersRoutes);
app.use("/users", usersRoutes);
app.use("/search", searchRoutes);
app.use("/search/actions", actionsRoutes);
app.use("/notifications", notificationsRoutes);
app.use("/feature-flags", featureFlagsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/import", importRoutes);
app.use("/conversations", conversationsRoutes);
app.use("/skills", skillsRoutes);

// Catch-all error handler — keeps stack traces out of API responses
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// A plain http.Server wraps the Express app so the WebSocket server (for
// /ws/search — live progress + A2UI streaming) can share the same port
// instead of needing a second process/port.
const server = createServer(app);
attachWebSocketServer(server);

const port = process.env.PORT || 4000;
server.listen(port, () => {
  console.log(`TalentFlow backend listening on http://localhost:${port}`);
  console.log(`WebSocket search available at ws://localhost:${port}/ws/search`);
});

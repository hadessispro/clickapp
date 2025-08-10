import express from "express";
import fetch from "node-fetch"; // Để gọi API từ ip-api
import fs from "fs"; // Để ghi log vào file

const app = express();

// Route chính (root route)
app.get("/", async (req, res) => {
  // Lấy IP người dùng từ header 'X-Forwarded-For' hoặc connection.remoteAddress
  const userIP = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  console.log("IP người dùng:", userIP);

  const ipApiUrl = `http://ip-api.com/json/${userIP}`;

  try {
    const response = await fetch(ipApiUrl);
    const data = await response.json();

    // Tạo log với thông tin vị trí người dùng (không hiển thị cho người dùng)
    const logData = `
      [${new Date().toISOString()}] User IP: ${userIP}
      Location: ${data.city}, ${data.region}, ${data.country}
      Latitude: ${data.lat}, Longitude: ${data.lon}
      Query: ${data.query}
    `;

    // Ghi log vào file (logs.txt)
    fs.appendFileSync("logs.txt", logData + "\n\n", "utf8");

    // Trả kết quả về cho người dùng mà không hiển thị thông tin vị trí
    res.status(200).json({
      message: "",
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi khi lấy vị trí người dùng" });
  }
});

// Cấu hình cổng và chạy server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy trên http://localhost:${PORT}`);
});

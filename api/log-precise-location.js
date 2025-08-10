import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// Trên Vercel, chỉ có thể ghi vào thư mục /tmp
// Ghi vào một file log mới để phân biệt với file log IP cũ
const logFilePath = path.join("/tmp", "precise_location_logs.txt");

export default async function handler(req, res) {
  // Chỉ chấp nhận các request gửi bằng phương thức POST
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // Lấy tọa độ từ body của request mà frontend đã gửi lên
    const { latitude, longitude } = req.body;
    // Lấy IP của người dùng để tham khảo
    const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    // Tùy chọn: Dùng tọa độ để lấy lại địa chỉ chi tiết từ OpenStreetMap
    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      {
        headers: { "User-Agent": "PreciseLogger/1.0" },
      }
    );
    const geoData = await geoResponse.json();
    const detailedAddress = geoData.display_name || "N/A";

    // Tạo nội dung log
    const logData = `
          [${new Date().toISOString()}] User IP: ${userIP}
          Precise Coordinates: Latitude: ${latitude}, Longitude: ${longitude}
          Detailed Address from Coords: ${detailedAddress}
        `;

    // Ghi vào file log
    fs.appendFileSync(logFilePath, logData + "\n\n", "utf8");

    // Trả về thông báo thành công cho frontend
    res.status(200).json({ message: "Location logged successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}

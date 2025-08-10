import express from "express";
import fetch from "node-fetch";
// Thay đổi nhỏ: Import 'promises' từ fs để dùng hàm bất đồng bộ, giúp server không bị treo
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Cần thiết để lấy __dirname trong ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
// Giữ nguyên mật khẩu hard-coded như file gốc
const ADMIN_PASSWORD = "1234567890";

// --- Middlewares ---
// Giữ nguyên như file gốc
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// --- API Endpoints ---

// API #1: Tự động ghi log vị trí ước tính dựa trên IP khi người dùng vào trang
app.post("/api/log-ip-location", async (req, res) => {
  const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const timestamp = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  let locationInfo = `[${timestamp}] User IP: ${userIP}\n   Location: (Unknown or Local IP)\n   ISP: N/A`;

  try {
    const ipApiUrl = `http://ip-api.com/json/${userIP}?fields=status,message,country,regionName,city,isp`;
    const response = await fetch(ipApiUrl);
    const apiData = await response.json();

    if (apiData.status !== "fail") {
      locationInfo = `[${timestamp}] User IP: ${userIP}\n   Estimated Location: ${apiData.city}, ${apiData.regionName}, ${apiData.country}\n   ISP: ${apiData.isp}`;
    } else {
      console.log(`ip-api.com notice for IP ${userIP}: ${apiData.message}`);
    }
  } catch (error) {
    console.error("Could not connect to ip-api.com:", error.message);
  }

  try {
    const logData = `\n${locationInfo}\n`;
    // Cải thiện nhỏ: Dùng hàm bất đồng bộ để không làm treo server
    await fs.appendFile("ip_logs.txt", logData, "utf8");
    res.status(200).json({ message: "IP location log attempted" });
  } catch (fileError) {
    console.error("Error writing to ip_logs.txt:", fileError);
    res.status(500).json({ message: "Failed to write to log file" });
  }
});

// API #2: Nhận và ghi log vị trí chính xác khi người dùng cấp quyền
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
    const logData = `
[${timestamp}] User IP: ${userIP}
   Precise Coords: Latitude: ${latitude}, Longitude: ${longitude}
   Detailed Address: ${detailedAddress}
`;
    // Cải thiện nhỏ: Dùng hàm bất đồng bộ để không làm treo server
    await fs.appendFile("precise_logs.txt", logData + "\n", "utf8");
    res.status(200).json({ message: "Precise location logged successfully" });
  } catch (error) {
    console.error("Error logging precise location:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// --- ADMIN ROUTES ---
// Các route này giữ nguyên như file gốc
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.redirect("/admin/dashboard");
  } else {
    res.send(`<h1>Sai mật khẩu!</h1><a href="/admin">Thử lại</a>`);
  }
});

app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// =================================================================
// ===== THAY ĐỔI CHÍNH: CÁC API CỦA ADMIN ĐƯỢC LÀM ĐỘNG HÓA  ======
// =================================================================

// API động để lấy nội dung log
app.get("/admin/api/logs/:logType", async (req, res) => {
  const { logType } = req.params; // Lấy 'ip' hoặc 'precise' từ URL
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).send("Loại log không hợp lệ.");
  }

  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);

  try {
    await fs.access(logFilePath); // Kiểm tra file có tồn tại không
    res.type("text/plain").sendFile(logFilePath);
  } catch {
    res.send(`File log '${fileName}' chưa được tạo hoặc trống.`);
  }
});

// API động để tải file log
app.get("/admin/api/download/:logType", async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).send("Loại log không hợp lệ.");
  }

  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);

  try {
    await fs.access(logFilePath); // Kiểm tra file tồn tại
    res.download(logFilePath);
  } catch {
    res.status(404).send(`File log '${fileName}' không tồn tại để tải.`);
  }
});

// API động để xóa file log
app.post("/admin/api/clear-logs/:logType", async (req, res) => {
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
      return res
        .status(200)
        .json({
          message: `File log '${fileName}' không tồn tại, không có gì để xóa.`,
        });
    }
    res.status(500).json({ message: "Không thể xóa file log do lỗi server." });
  }
});

// --- Khởi động Server ---
app.listen(PORT, () => {
  console.log(`Server đa năng đang chạy tại http://localhost:${PORT}`);
  console.log("Truy cập trang admin tại http://localhost:3000/admin");
});

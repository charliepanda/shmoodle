// ===== GLOBAL VARIABLES =====
var socket;
let faceApi;
let detections = [];

// Swapped brush variables:
// • Your own facial expression (from face-api) will update these,
//   and they will be used by your partner to draw strokes.
let selfBrushColor, selfBrushTargetColor;
// • Your partner’s facial expression (received via socket)
//   will update these, and you will use them to draw your own strokes.
let partnerBrushColor, partnerBrushTargetColor;

let brushSize = 10;
let other = { dominantEmotion: 'neutral' };

let roomID;

// Offscreen canvas for scrolling drawing:
let canvasGraphics;

// Video capture (for face detection)
let videoInput;

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false;

// STUN server configuration for WebRTC
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// ===== WEBRTC FUNCTIONS =====
async function initializeWebRTC() {
  try {
    // Get local audio stream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // Create a new peer connection
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local audio tracks to the peer connection
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Set up remote audio stream
    remoteStream = new MediaStream();
    peerConnection.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      // Play the remote audio
      const remoteAudio = new Audio();
      remoteAudio.srcObject = remoteStream;
      remoteAudio.play();
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { candidate: event.candidate, roomID });
      }
    };

    console.log("WebRTC initialized");
  } catch (error) {
    console.error("Error initializing WebRTC:", error);
  }
}

async function startCall() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  socket.emit("offer", { offer: peerConnection.localDescription, roomID });
  console.log("Offer sent to the server");
}

function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });
  // (UI styling updates for mute button can go here)
}

// ===== SETUP FUNCTION =====
function setup() {
  // Create the main canvas to fill the browser window
  createCanvas(windowWidth, windowHeight);
  // Create an offscreen graphics canvas for drawing and scrolling.
  canvasGraphics = createGraphics(width, height);
  canvasGraphics.background(0); // Start with a black background

  // Set up video capture for face detection
  videoInput = createCapture(VIDEO);
  videoInput.size(width / 4, height / 4); // Smaller preview
  videoInput.hide();

  // Initialize ml5 face-api with options
  const faceOptions = {
    withLandmarks: true,
    withExpressions: true,
    withDescriptors: false,
    minConfidence: 0.5,
  };
  faceApi = ml5.faceApi(videoInput, faceOptions, faceReady);

  // Set up the room and socket connection
  const params = new URLSearchParams(window.location.search);
  roomID = params.get("room") || Math.random().toString(36).substring(2, 10);
  if (!params.get("room")) {
    window.history.replaceState(null, null, `?room=${roomID}`);
  }
  socket = io.connect("https://shmoodle.glitch.me/");
  socket.emit("joinRoom", { roomID });

  // Initialize WebRTC (for audio)
  initializeWebRTC();

  // --- UI Buttons ---

  // Start Call button:
  const callButton = createButton("Start Call");
  callButton.position(10, 10);
  callButton.mousePressed(startCall);

  // Mute button:
  muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>');
  muteButton.position(40, height - 80);
  muteButton.style("width", "60px");
  muteButton.style("height", "60px");
  muteButton.style("font-size", "24px");
  muteButton.style("background", "rgba(58,58,58)");
  muteButton.style("color", "white");
  muteButton.style("border", "none");
  muteButton.style("border-radius", "50%");
  muteButton.style("display", "flex");
  muteButton.style("align-items", "center");
  muteButton.style("justify-content", "center");
  muteButton.style("cursor", "pointer");
  muteButton.mousePressed(toggleMute);

  // Invite Partner button:
  const inviteButton = createButton("Invite Partner");
  inviteButton.addClass("invite-button");
  inviteButton.position(windowWidth - 160, windowHeight - 60);
  const partnerConnectedText = createDiv("Partner Connected!");
  partnerConnectedText.style("color", "white");
  partnerConnectedText.style("font-size", "16px");
  partnerConnectedText.style("font-weight", "bold");
  partnerConnectedText.style("display", "none");
  partnerConnectedText.position(windowWidth - 160, windowHeight - 60);

  socket.on("roomStatus", (numUsers) => {
    if (numUsers > 1) {
      inviteButton.hide();
      partnerConnectedText.style("display", "block");
    } else {
      partnerConnectedText.style("display", "none");
      inviteButton.show();
    }
  });

  inviteButton.mousePressed(() => {
    const script =
      new URLSearchParams(window.location.search).get("script") ||
      "myemo_yourbrush_scroll.js";
    const roomID =
      new URLSearchParams(window.location.search).get("room") || "defaultRoom";
    const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
    navigator.clipboard.writeText(link);
    inviteButton.html("Link Copied");
    const bubble = createDiv(
      "Share the link with your partner to Shmoodle together."
    );
    bubble.style("position", "absolute");
    bubble.style("top", `${windowHeight - 120}px`);
    bubble.style("left", `${windowWidth - 200}px`);
    bubble.style("background", "rgba(58,58,58,1)");
    bubble.style("color", "white");
    bubble.style("padding", "10px");
    bubble.style("border-radius", "5px");
    bubble.style("font-size", "14px");
    bubble.style("box-shadow", "0 0 10px rgba(0,0,0,0.5)");
    setTimeout(() => {
      bubble.remove();
      inviteButton.html("Invite Partner");
    }, 8000);
  });

  // Clear Canvas button:
  const clearButton = createButton("Clear Our Shmoodle");
  clearButton.position(windowWidth - 160, height - 120);
  clearButton.style("background", "rgba(58, 58, 58, 1)");
  clearButton.style("color", "white");
  clearButton.style("padding", "10px 20px");
  clearButton.style("border", "none");
  clearButton.style("border-radius", "5px");
  clearButton.style("font-size", "16px");
  clearButton.style("cursor", "pointer");
  clearButton.style("box-shadow", "0 0 10px rgba(255, 255, 255, 0.2)");
  clearButton.mousePressed(() => {
    canvasGraphics.background(0);
    socket.emit("mouse", { case: 2 });
  });

  // --- Initialize brush colors ---
  selfBrushColor = color(255);
  selfBrushTargetColor = color(255);
  partnerBrushColor = color(255);
  partnerBrushTargetColor = color(255);

  // ===== SOCKET EVENT LISTENERS =====
  socket.on("mouse", (data) => {
    if (data.case === 1) {
      // Received partner's dominant emotion update
      other.dominantEmotion = data.dominantEmotion;
      // Your local drawing brush (for your strokes) is controlled by your partner’s face.
      partnerBrushTargetColor = getEmotionColor(other.dominantEmotion);
    } else if (data.case === 3) {
      // Received partner’s drawing stroke.
      // (Your own face determines the color used by your partner to draw on THEIR canvas.)
      const scaledOldX = data.oldX * width;
      const scaledOldY = data.oldY * height;
      const scaledX = data.x * width;
      const scaledY = data.y * height;
      // Smoothly blend your self–brush color toward your target.
      selfBrushColor = lerpColor(selfBrushColor, selfBrushTargetColor, 0.05);
      canvasGraphics.stroke(selfBrushColor);
      canvasGraphics.strokeWeight(brushSize);
      canvasGraphics.line(scaledOldX, scaledOldY, scaledX, scaledY);
    } else if (data.case === 2) {
      // Clear canvas command.
      canvasGraphics.background(0);
    }
  });

  // ===== WEBRTC SIGNALING =====
  socket.on("offer", async (data) => {
    if (data.roomID !== roomID) return;
    console.log("Received offer:", data.offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("answer", { answer: peerConnection.localDescription, roomID });
  });

  socket.on("answer", async (data) => {
    if (data.roomID !== roomID) return;
    console.log("Received answer:", data.answer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  });

  socket.on("ice-candidate", async (data) => {
    if (data.roomID !== roomID) return;
    console.log("Received ICE candidate:", data.candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  });
}

// ===== FACE-API FUNCTIONS =====
function faceReady() {
  faceApi.detect(gotFaces);
}

function gotFaces(error, result) {
  if (error) {
    console.error(error);
    return;
  }
  detections = result;
  if (detections.length > 0) {
    let expressions = detections[0].expressions;
    // Find the dominant emotion (e.g., happy, sad, angry, neutral)
    let dominantEmotion = Object.keys(expressions).reduce((a, b) =>
      expressions[a] > expressions[b] ? a : b
    );
    // Send your dominant emotion to your partner.
    socket.emit("mouse", { case: 1, dominantEmotion: dominantEmotion });
    // Your own face controls the brush that your partner sees.
    selfBrushTargetColor = getEmotionColor(dominantEmotion);
  }
  faceApi.detect(gotFaces); // Continue detection
}

// ===== DRAW LOOP =====
function draw() {
  // ----- Scroll the offscreen canvas (scroll left by 1 pixel) -----
  canvasGraphics.copy(canvasGraphics, 1, 0, width - 1, height, 0, 0, width - 1, height);
  canvasGraphics.fill(0);
  canvasGraphics.noStroke();
  canvasGraphics.rect(width - 1, 0, 1, height);

  // ----- Local drawing using your partner’s brush color -----
  // (Your partner’s face controls the color you draw with.)
  partnerBrushColor = lerpColor(
    partnerBrushColor,
    partnerBrushTargetColor,
    0.05
  );
  if (mouseIsPressed) {
    canvasGraphics.stroke(partnerBrushColor);
    canvasGraphics.strokeWeight(brushSize);
    canvasGraphics.line(mouseX, mouseY, pmouseX, pmouseY);
    // Send normalized stroke coordinates to the partner.
    socket.emit("mouse", {
      case: 3,
      oldX: pmouseX / width,
      oldY: pmouseY / height,
      x: mouseX / width,
      y: mouseY / height,
    });
  } else {
    // Notify partner that the mouse is released.
    socket.emit("mouse", { case: 4 });
  }

  // ----- Display the scrolling offscreen canvas -----
  image(canvasGraphics, 0, 0);
}

// ===== UTILITY: Map an emotion to a color =====
function getEmotionColor(dominantEmotion) {
  switch (dominantEmotion) {
    case "happy":
      return color(255, 223, 0); // Yellow
    case "sad":
      return color(0, 0, 255); // Blue
    case "angry":
      return color(255, 0, 0); // Red
    case "neutral":
      return color(200, 200, 200); // Light gray
    default:
      return color(0, 0, 0); // Black as default
  }
}

// ===== HANDLE WINDOW RESIZE =====
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  canvasGraphics = createGraphics(width, height);
  canvasGraphics.background(0);
}

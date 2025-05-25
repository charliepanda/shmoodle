var socket;
let faceApi;
let detections = [];
let currentColor; // For your brush
let targetColor; // Target color for your brush
let partnerColor; // For partner's brush
let partnerTargetColor; // Target color for partner's brush
let brushSize = 10;
let other = {
  dominantEmotion: 'neutral',
};
let lastSentTime = 0;
let throttleInterval = 20; // Send data every 30ms

let partnerConnected = false; // Track if partner is connected
let roomID; // Unique room ID for each session

// Graphics for drawing
let drawings;

// Video capture
let videoInput;

// WebRTC variables
let localStream;
let remoteStream;
let peerConnection;
let isMuted = false; // Mute state

// Offscreen canvas for scrolling
let canvasGraphics;

// To track the partner's last position
let partnerLastX = null;
let partnerLastY = null;

// STUN server configuration
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Initialize WebRTC and request microphone access
async function initializeWebRTC() {
  try {
    // Get local audio stream
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

    // Create a new WebRTC peer connection
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Add local audio stream tracks to the peer connection
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    // Set up remote audio stream
    remoteStream = new MediaStream();
    peerConnection.ontrack = (event) => {
      remoteStream.addTrack(event.track);
      // Play the remote stream through an audio element
      const remoteAudio = new Audio();
      remoteAudio.srcObject = remoteStream;
      remoteAudio.play();
    };

    // Handle ICE candidates and send them to the server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { candidate: event.candidate, roomID });
      }
    };

    console.log('WebRTC initialized');
  } catch (error) {
    console.error('Error initializing WebRTC:', error);
  }
}

// Start the WebRTC call
async function startCall() {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Send the offer to the server
  socket.emit('offer', { offer: peerConnection.localDescription, roomID });
  console.log('Offer sent to the server');
}

// Toggle mute/unmute
function toggleMute() {
  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted; // Enable or disable the audio track
  });

  // Update button styles and icon based on mute state
  if (isMuted) {
    muteButton.style('background', 'rgba(255, 255, 255, 1)'); // Solid white background
    muteButton.style('color', 'black'); // Black icon
  } else {
    muteButton.style('background', 'rgba(58,58,58)'); // Transparent white background
    muteButton.style('color', 'white'); // White icon
  }
}


function setup() {
  // Create a full-screen canvas
  createCanvas(windowWidth, windowHeight);
  canvasGraphics = createGraphics(width, height); // Offscreen canvas
  canvasGraphics.background(0); // Black background for the offscreen canvas

  // Initialize video capture
  let videoInput = createCapture(VIDEO);
  videoInput.size(width / 4, height / 4); // Smaller video feed
  videoInput.hide();

  // Initialize ml5 face-api with options
  const faceOptions = {
    withLandmarks: true,
    withExpressions: true,
    withDescriptors: false,
    minConfidence: 0.5,
  };
  faceApi = ml5.faceApi(videoInput, faceOptions, faceReady);

  const params = new URLSearchParams(window.location.search);
  roomID = params.get('room') || Math.random().toString(36).substring(2, 10);
  if (!params.get('room')) {
    window.history.replaceState(null, null, `?room=${roomID}`);
  }

  socket = io.connect('https://shmoodle.glitch.me/');
  socket.emit('joinRoom', { roomID });

  
     initializeWebRTC(); // Initialize WebRTC audio
  
  // ───── Invite Toast ─────
inviteToast = createDiv("You're all alone right now, send the invite link to your friend and Shmoodle together.");
inviteToast.id('invite-toast');
inviteToast.style('position', 'absolute');
inviteToast.style('top', '20px');
inviteToast.style('left', '50%');
inviteToast.style('transform', 'translateX(-50%)');
inviteToast.style('background', 'rgba(58, 58, 58, 0.95)');
inviteToast.style('color', 'white');
inviteToast.style('padding', '16px 24px');
inviteToast.style('border-radius', '8px');
inviteToast.style('font-size', '16px');
inviteToast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');
inviteToast.style('z-index', '20');
inviteToast.style('display', 'none');
  
// ───── Partner Toast ─────
toast = createDiv();
toast.id('partner-toast');
toast.style('position', 'absolute');
toast.style('top', '20px');
toast.style('left', '50%');
toast.style('transform', 'translateX(-50%)');
toast.style('background', 'rgba(58, 58, 58, 0.95)');
toast.style('color', 'white');
toast.style('padding', '16px 24px');
toast.style('border-radius', '8px');
toast.style('font-family', "'Karla', sans-serif");
toast.style('font-size', '16px');
toast.style('font-weight', '500');
toast.style('display', 'none');
toast.style('z-index', '20');
toast.style('display', 'flex');
toast.style('align-items', 'center');
toast.style('gap', '12px');
toast.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)');

const toastText = createDiv('Your partner is online.');
toastText.parent(toast);
toastText.style('font-weight', 'bold');
toastText.style('display', 'inline-block');
toastText.style('margin-right', '12px');
toastText.style('padding', '0');

const startCallBtnInToast = createButton('Start Call');
startCallBtnInToast.parent(toast);
startCallBtnInToast.style('padding', '6px 16px');
startCallBtnInToast.style('background', 'white');
startCallBtnInToast.style('color', 'black');
startCallBtnInToast.style('border', 'none');
startCallBtnInToast.style('border-radius', '4px');
startCallBtnInToast.style('cursor', 'pointer');
startCallBtnInToast.mousePressed(() => {
  startCall();
  socket.emit('callStarted', { roomID });
  muteButton.show();
  toast.hide();
});
  
    socket.on('hideToast', () => {
  toast.hide();
});
  
socket.on('showMuteButton', () => {
  muteButton.show();
  topicButton.show(); // Show topic button after call starts

});


const copyLinkButton = createButton('Copy Link');
copyLinkButton.parent(inviteToast);
copyLinkButton.style('margin-left', '12px');
copyLinkButton.style('padding', '6px 16px');
copyLinkButton.style('background', 'white');
copyLinkButton.style('color', 'black');
copyLinkButton.style('border', 'none');
copyLinkButton.style('border-radius', '4px');
copyLinkButton.style('cursor', 'pointer');
copyLinkButton.mousePressed(() => {
  const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_shared_scroll.js';
  const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
  navigator.clipboard.writeText(link);
  copyLinkButton.html('Link Copied!');
});


  // // Add a button to start the call
  // const callButton = createButton('Start Call');
  // callButton.position(10, 10);
  // callButton.mousePressed(startCall);
  
// // Create the "Invite Partner" button
// const inviteButton = createButton('Invite Partner');
// inviteButton.addClass('invite-button'); // Apply the CSS class
// inviteButton.position(windowWidth - 160, windowHeight - 60); // Place on the bottom right

// // Add the partner connection text (hidden by default)
// const partnerConnectedText = createDiv('Partner Connected!');
// partnerConnectedText.style('color', 'white');
// partnerConnectedText.style('font-size', '16px');
// partnerConnectedText.style('font-weight', 'bold');
// partnerConnectedText.style('display', 'none'); // Initially hidden
// partnerConnectedText.position(windowWidth - 160, windowHeight - 60); // Same position as the button

// Listen for room status updates
socket.on('roomStatus', (numUsers) => {
  if (numUsers > 1) {
    inviteToast.hide();
    toast.show();
  } else {
    inviteToast.show();
    toast.hide();
  }
});

  socket.on('callStarted', () => {
  toast.hide(); // Hide for both users
});

socket.on('showMuteButton', () => {
  muteButton.show();
});


// // Handle invite partner button click
// inviteButton.mousePressed(() => {
//   // Copy the link to clipboard
//   const script = new URLSearchParams(window.location.search).get('script') || 'newmodel_shared_scroll.js';
//   const roomID = new URLSearchParams(window.location.search).get('room') || 'defaultRoom';
//  // Update the URL with script and roomID
//   const link = `${window.location.origin}${window.location.pathname}?script=${script}&room=${roomID}`;
//   navigator.clipboard.writeText(link);
//   // Change the button text to "Link Copied"
//   inviteButton.html('Link Copied');

//   // Create a temporary text bubble
//   const bubble = createDiv('Share the link with your partner to Shmoodle together.');
//   bubble.style('position', 'absolute');
//   bubble.style('top', `${windowHeight - 120}px`); // Position above the button
//   bubble.style('left', `${windowWidth - 200}px`); // Align horizontally with the button
//   bubble.style('background', 'rgba(58,58,58,1)');
//   bubble.style('color', 'white');
//   bubble.style('padding', '10px');
//   bubble.style('border-radius', '5px');
//   bubble.style('font-size', '14px');
//   bubble.style('box-shadow', '0 0 10px rgba(0,0,0,0.5)');

//   // Remove the bubble and reset button text after 5 seconds
//   setTimeout(() => {
//     bubble.remove();
//     inviteButton.html('Invite Partner');
//   }, 8000);
// });


// Add a button to toggle mute/unmute
muteButton = createButton('<i class="fa-solid fa-microphone-slash"></i>'); // Font Awesome icon
muteButton.position(40, height - 100); // Bottom-left of the screen
muteButton.style('width', '60px');
muteButton.style('height', '60px');
muteButton.style('font-size', '24px'); // Font Awesome size
muteButton.style('background', 'rgba(58,58,58)'); // Initial transparent white background
muteButton.style('color', 'white'); // Initial white icon color
muteButton.style('border', 'none');
muteButton.style('border-radius', '50%'); // Circular button
muteButton.style('display', 'flex');
muteButton.style('align-items', 'center');
muteButton.style('justify-content', 'center');
muteButton.style('cursor', 'pointer');
muteButton.mousePressed(toggleMute);
muteButton.mouseOver(() => (noCanvasInteraction = true)); // Prevent drawing when hovering over the button
muteButton.mouseOut(() => (noCanvasInteraction = false)); // Re-enable drawing
  muteButton.hide();

  


  // Listen for partner's brush strokes and colors
  socket.on('mouse', (data) => {
    if (data.case === 1) {
      // Update partner's brush color
      partnerColor = color(data.color[0], data.color[1], data.color[2], data.color[3]);
    } else if (data.case === 3) {
      // Draw partner's brush stroke on the offscreen canvas
      if (partnerLastX !== null && partnerLastY !== null) {
        canvasGraphics.stroke(color(...data.stroke.color));
        canvasGraphics.strokeWeight(data.stroke.size);
        canvasGraphics.line(partnerLastX, partnerLastY, data.stroke.x, data.stroke.y);
      }
      // Update partner's last position
      partnerLastX = data.stroke.x;
      partnerLastY = data.stroke.y;
    } else if (data.case === 4) {
      // Reset partner's last position when they release the mouse
      partnerLastX = null;
      partnerLastY = null;
    } else if (data.case === 2) {
      // Clear the canvas
      canvasGraphics.background(0);
    }
  });
  
    // WebRTC signaling listeners
  socket.on('offer', async (offer) => {
    console.log('Received offer:', offer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send the answer back to the server
    socket.emit('answer', peerConnection.localDescription);
  });

  socket.on('answer', async (answer) => {
    console.log('Received answer:', answer);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('ice-candidate', async (candidate) => {
    console.log('Received ICE candidate:', candidate);
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Error adding ICE candidate:', error);
    }
  });


  // Default brush colors
  currentColor = color(255, 255, 255, 255); // Solid white for your brush
  partnerColor = color(200, 200, 200, 255); // Default gray for partner
}

function faceReady() {
  faceApi.detect(gotFaces);
}

function gotFaces(error, result) {
  if (error) {
    console.error(error);
    return;
  }

  detections = result;

  // Analyze emotions and update brush color
  updateBrushColor();

  faceApi.detect(gotFaces); // Continue detection
}

function draw() {
  // Scroll the offscreen canvas
  canvasGraphics.copy(canvasGraphics, 1, 0, width - 1, height, 0, 0, width - 1, height);
  canvasGraphics.fill(0); // Fill the right edge with black
  canvasGraphics.noStroke();
  canvasGraphics.rect(width - 1, 0, 1, height); // Clear the rightmost column as it scrolls

  // Draw the offscreen canvas on the main canvas
  image(canvasGraphics, 0, 0);

  // Add local brush strokes
  if (mouseIsPressed) {
    canvasGraphics.stroke(currentColor);
    canvasGraphics.strokeWeight(brushSize);
    canvasGraphics.line(mouseX, mouseY, pmouseX, pmouseY);

    // Emit the new stroke to the server
    socket.emit('mouse', {
      case: 3,
      stroke: {
        x: mouseX,
        y: mouseY,
        px: pmouseX,
        py: pmouseY,
        color: [red(currentColor), green(currentColor), blue(currentColor), 255],
        size: brushSize,
      },
    });
  } else {
    // Notify the partner that the mouse has been released
    socket.emit('mouse', { case: 4 });
  }
}

function updateBrushColor() {
  if (detections.length > 0) {
    let expressions = detections[0].expressions;

    // Calculate weighted average of colors based on emotions
    let targetColor = color(0, 0, 0, 255);
    let totalWeight = 0;

    const emotionColors = {
      happy: color(255, 223, 0, 255), // Yellow
      sad: color(0, 0, 255, 255), // Blue
      angry: color(255, 0, 0, 255), // Red
      neutral: color(200, 200, 200, 255), // Light gray
      disgusted: color(0, 128, 0, 255), // Green
      surprised: color(0, 255, 255, 255), // Cyan
      fearful: color(255, 165, 0, 255), // Orange
    };

    for (let emotion in emotionColors) {
      if (expressions[emotion]) {
        let weight = expressions[emotion];
        targetColor = lerpColor(targetColor, emotionColors[emotion], weight);
        totalWeight += weight;
      }
    }

    if (totalWeight > 0) {
      currentColor = lerpColor(currentColor, targetColor, 0.1); // Smooth blending
    }

    // Emit the current color to the partner
    socket.emit('mouse', {
      case: 1,
      color: currentColor.levels,
    });
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  canvasGraphics = createGraphics(width, height);
  canvasGraphics.background(0); // Reset to black background
}


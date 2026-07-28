/* =========================================================
   TikTok Camera Clone — Browser Media API integration
   ========================================================= */

(() => {
  "use strict";

  // DOM references
  const cameraVideo = document.getElementById("camera-video");
  const recordedVideo = document.getElementById("recorded-video");
  const permissionOverlay = document.getElementById("permission-overlay");
  const loadingOverlay = document.getElementById("loading-overlay");
  const errorSection = document.getElementById("error-message-section");
  const liveCameraSection = document.getElementById("live-camera-section");
  const previewSection = document.getElementById("recording-preview");
  const enableCameraButton = document.getElementById("enable-camera-button");
  const recordButton = document.getElementById("record-button");
  const galleryButton = document.getElementById("gallery-button");
  const uploadButton = document.getElementById("upload-button");
  const flipCameraButton = document.getElementById("flip-camera-button");
  const toolbarFlipCameraButton = document.getElementById("toolbar-flip-camera-button");
  const closeButton = document.getElementById("close-button");
  const recordingTimer = document.getElementById("recording-timer");
  const recordingBadge = document.getElementById("recording-badge");
  const progressBar = document.getElementById("progress-bar");
  const retakeButton = document.getElementById("retake-button");
  const downloadButton = document.getElementById("download-button");
  const saveDraftButton = document.getElementById("save-draft-button");
  const nextButton = document.getElementById("next-button");
  const previewActions = document.getElementById("preview-actions");
  const previewHeading = previewSection.querySelector("h2");
  const recordInnerCircle = document.getElementById("record-inner-circle");
  const modeButtons = [...document.querySelectorAll("#recording-modes button")];

  // Camera and recording state
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingBlob = null;
  let recordingUrl = null;
  let timerInterval = null;
  let recordingStartedAt = 0;
  let facingMode = "user";
  let selectedMode = "Video";
  let isImagePreview = false;
  let recordingStopTimeout = null;
  let previewSource = "recording";
  let hasCameraPermission = false;

  // Image previews are mounted only when needed, avoiding Android Chrome hidden-element issues.
  let imagePreviewContainer = null;

  // These actions are added at runtime because the supplied HTML has one shared preview layout.
  const closePreviewButton = document.createElement("button");
  closePreviewButton.id = "close-preview-button";
  closePreviewButton.type = "button";
  closePreviewButton.ariaLabel = "Close preview and return to camera";
  closePreviewButton.title = "Close preview";
  closePreviewButton.textContent = "Close";
  closePreviewButton.hidden = true;

  const uploadStoryButton = document.createElement("button");
  uploadStoryButton.id = "upload-story-button";
  uploadStoryButton.type = "button";
  uploadStoryButton.ariaLabel = "Upload Story";
  uploadStoryButton.title = "Upload Story";
  uploadStoryButton.textContent = "Upload Story";
  uploadStoryButton.hidden = true;
  previewActions.append(closePreviewButton, uploadStoryButton);

  const previewButtons = [retakeButton, downloadButton, nextButton, closePreviewButton, uploadStoryButton];
  const errorMessages = {
    denied: document.getElementById("camera-access-denied-message"),
    notFound: document.getElementById("camera-not-found-message"),
    generic: document.getElementById("camera-generic-error-message")
  };

  /** Explicitly mounts an image preview in a dedicated, visible container. */
  function showImagePreview(url) {
    clearImagePreview();

    imagePreviewContainer = document.createElement("section");
    imagePreviewContainer.id = "image-preview-container";
    imagePreviewContainer.setAttribute("aria-label", "Selected image preview");
    imagePreviewContainer.style.display = "block";
    imagePreviewContainer.style.width = "min(100%, 320px)";
    imagePreviewContainer.style.maxHeight = "58dvh";
    imagePreviewContainer.style.overflow = "hidden";
    imagePreviewContainer.style.borderRadius = "20px";

    const image = document.createElement("img");
    image.id = "gallery-image-preview";
    image.src = url;
    image.alt = "Selected gallery image";
    image.style.display = "block";
    image.style.width = "100%";
    image.style.maxHeight = "58dvh";
    image.style.objectFit = "contain";

    imagePreviewContainer.append(image);
    previewSection.insertBefore(imagePreviewContainer, previewActions);
    recordedVideo.style.display = "none";
  }

  /** Removes the temporary image container and restores the video preview element. */
  function clearImagePreview() {
    imagePreviewContainer?.remove();
    imagePreviewContainer = null;
    recordedVideo.style.display = "block";
  }

  /** Sets the enabled state of preview actions that require media. */
  function setPreviewActionsEnabled(enabled) {
    previewButtons.forEach((button) => {
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", String(!enabled));
    });
  }

  /** Prevents recording mode changes until an active recording has finished. */
  function setModesLocked(locked) {
    modeButtons.forEach((button) => {
      button.disabled = locked;
      button.setAttribute("aria-disabled", String(locked));
    });
  }

  /** Shows or hides the camera loading layer. */
  function showLoading() {
    loadingOverlay.hidden = false;
  }

  function hideLoading() {
    loadingOverlay.hidden = true;
  }

  /** Shows one friendly camera error at a time. */
  function showError(type = "generic", customMessage = "") {
    hideLoading();
    Object.values(errorMessages).forEach((message) => {
      message.hidden = true;
    });

    const message = errorMessages[type] || errorMessages.generic;
    if (customMessage) {
      message.textContent = customMessage;
    }
    message.hidden = false;
    errorSection.hidden = false;
  }

  function hideError() {
    errorSection.hidden = true;
    Object.values(errorMessages).forEach((message) => {
      message.hidden = true;
    });
  }

  /** Stops all active camera tracks and releases the hardware. */
  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }

    cameraVideo.srcObject = null;
  }

  /** Requests and displays a live camera stream for the current facing mode. */
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showError("generic");
      return false;
    }

    showLoading();
    hideError();

    try {
      stopCamera();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: true
      });

      cameraVideo.autoplay = true;
      cameraVideo.muted = true;
      cameraVideo.playsInline = true;
      cameraVideo.srcObject = mediaStream;
      await cameraVideo.play();

      permissionOverlay.hidden = true;
      hasCameraPermission = true;
      liveCameraSection.hidden = false;
      hideLoading();
      return true;
    } catch (error) {
      const errorType = error.name === "NotAllowedError" || error.name === "SecurityError"
        ? "denied"
        : error.name === "NotFoundError" || error.name === "OverconstrainedError"
          ? "notFound"
          : "generic";

      showError(errorType);
      permissionOverlay.hidden = false;
      console.error("Unable to start camera:", error);
      return false;
    }
  }

  /** Initializes the permission-led camera flow without opening the camera. */
  function initializeCamera() {
    setPreviewActionsEnabled(false);
    recordButton.disabled = false;
    progressBar.value = 0;
    permissionOverlay.hidden = false;
    loadingOverlay.hidden = true;
  }

  /** Stops the old stream and changes between front and rear cameras. */
  async function switchCamera() {
    if (!mediaStream || mediaRecorder?.state === "recording") {
      return;
    }

    facingMode = facingMode === "user" ? "environment" : "user";
    await startCamera();
  }

  /** Returns a supported recorder configuration, where the browser supplies a fallback if needed. */
  function getRecorderOptions() {
    const mimeTypes = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
    return mimeType ? { mimeType } : undefined;
  }

  /** Starts a MediaRecorder session and its visual recording indicators. */
  function startRecording() {
    if (selectedMode === "Photo") {
      capturePhoto();
      return;
    }

    if (selectedMode === "LIVE") {
      alert("LIVE streaming requires backend integration.");
      return;
    }

    if (!mediaStream) {
      showError("generic", "Please enable the camera before recording.");
      return;
    }

    if (!window.MediaRecorder) {
      showError("generic", "MediaRecorder is not supported by this browser.");
      console.error("MediaRecorder is unavailable in this browser.");
      return;
    }

    recordedChunks = [];
    recordingBlob = null;
    isImagePreview = false;
    clearImagePreview();
    recordedVideo.controls = true;
    setPreviewActionsEnabled(false);

    try {
      mediaRecorder = new MediaRecorder(mediaStream, getRecorderOptions());
      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      });
      mediaRecorder.addEventListener("stop", handleRecordingComplete, { once: true });
      mediaRecorder.start(250);

      recordingStartedAt = Date.now();
      setModesLocked(true);
      recordingTimer.hidden = false;
      recordingBadge.hidden = false;
      recordButton.setAttribute("aria-label", "Stop recording");
      recordButton.setAttribute("title", "Stop recording");
      recordButton.classList.add("is-recording");
      recordButton.style.animation = "record-pulse 1.1s infinite";
      recordInnerCircle.style.transform = "scale(0.72)";
      timerInterval = window.setInterval(updateTimer, 250);
      updateTimer();

      const duration = getRecordingDurationLimit();
      if (duration) {
        recordingStopTimeout = window.setTimeout(stopRecording, duration * 1000);
      }
    } catch (error) {
      showError("generic");
      console.error("Unable to begin recording:", error);
    }
  }

  /** Stops a current recording; the recorder's stop handler produces the preview. */
  function stopRecording() {
    if (mediaRecorder?.state !== "recording") {
      return;
    }

    mediaRecorder.stop();
    clearRecordingIndicators();
  }

  /** Clears recording UI state and resets elapsed time/progress. */
  function clearRecordingIndicators() {
    window.clearInterval(timerInterval);
    window.clearTimeout(recordingStopTimeout);
    timerInterval = null;
    recordingStopTimeout = null;
    recordingBadge.hidden = true;
    recordingTimer.hidden = true;
    recordingTimer.textContent = "00:00";
    recordingTimer.dateTime = "PT0M0S";
    progressBar.value = 0;
    recordButton.classList.remove("is-recording");
    recordButton.style.animation = "";
    recordInnerCircle.style.transform = "";
    recordButton.setAttribute("aria-label", "Start recording");
    recordButton.setAttribute("title", "Start recording");
    setModesLocked(false);
  }

  /** Returns the automatic recording cap for short-form capture modes. */
  function getRecordingDurationLimit() {
    return selectedMode === "15s" ? 15 : selectedMode === "60s" ? 60 : 0;
  }

  /** Updates count-up or countdown display and recording progress. */
  function updateTimer() {
    const elapsedMilliseconds = Date.now() - recordingStartedAt;
    const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);
    const duration = getRecordingDurationLimit();
    const displaySeconds = duration ? Math.max(0, duration - elapsedSeconds) : elapsedSeconds;
    const minutes = Math.floor(displaySeconds / 60);
    const seconds = displaySeconds % 60;
    recordingTimer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    recordingTimer.dateTime = `PT${minutes}M${seconds}S`;
    progressBar.value = Math.min((elapsedMilliseconds / ((duration || 60) * 1000)) * 100, 100);
  }

  /** Turns recorder chunks into a playable Blob and opens the preview. */
  function handleRecordingComplete() {
    if (!recordedChunks.length) {
      showError("generic");
      return;
    }

    const type = mediaRecorder?.mimeType || "video/webm";
    recordingBlob = new Blob(recordedChunks, { type });
    replaceRecordingUrl(URL.createObjectURL(recordingBlob));
    showPreview();
  }

  /** Captures the current camera frame as a PNG using an off-screen canvas. */
  function capturePhoto() {
    if (!mediaStream || cameraVideo.videoWidth === 0) {
      showError("generic", "The camera is not ready to take a photo.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    canvas.getContext("2d").drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        showError("generic", "Unable to capture a photo.");
        return;
      }

      recordingBlob = blob;
      isImagePreview = true;
      previewSource = "photo";
      replaceRecordingUrl(URL.createObjectURL(blob));
      showImagePreview(recordingUrl);
      showPreview();
    }, "image/png");
  }

  /** Safely replaces any blob URL that belongs to a previous preview. */
  function replaceRecordingUrl(url) {
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }

    recordingUrl = url;
    recordedVideo.src = recordingUrl;
  }

  /** Opens the recorded-media layer and keeps the live feed out of view. */
  function showPreview() {
    if (!recordingUrl) {
      return;
    }

    liveCameraSection.hidden = true;
    previewSection.hidden = false;
    previewHeading.textContent = "Preview";
    configurePreviewActions();
    setPreviewActionsEnabled(true);
    if (!isImagePreview) {
      recordedVideo.play().catch(() => {});
    }
    (previewSource === "gallery" || previewSource === "upload" ? closePreviewButton : retakeButton).focus();
  }

  /** Adjusts the shared preview actions for recordings, stories, and imported media. */
  function configurePreviewActions() {
    const isStory = selectedMode === "Story" && previewSource === "recording";
    const isGallery = previewSource === "gallery";
    const isUpload = previewSource === "upload";
    const isImported = isGallery || isUpload;

    uploadStoryButton.hidden = !isStory;
    closePreviewButton.hidden = !isImported;
    closePreviewButton.textContent = "Back to Camera";
    closePreviewButton.setAttribute("aria-label", "Back to Camera");
    closePreviewButton.title = "Back to Camera";
    nextButton.hidden = isStory || isImported;
    saveDraftButton.hidden = isImported;
    retakeButton.hidden = isImported;
    retakeButton.textContent = "Retake";
    retakeButton.setAttribute("aria-label", "Retake recording");
    retakeButton.title = "Retake recording";
    nextButton.textContent = "Next";
    nextButton.setAttribute("aria-label", "Continue to next step");
  }

  /** Downloads the current recording or gallery file. */
  function downloadVideo() {
    if (!recordingUrl) {
      return;
    }

    const link = document.createElement("a");
    link.href = recordingUrl;
    link.download = isImagePreview ? "tiktok-photo.png" : "tiktok-recording.webm";
    document.body.append(link);
    link.click();
    link.remove();
  }

  /** Closes preview and immediately resumes the already-open live camera stream. */
  async function retakeRecording() {
    previewSection.hidden = true;
    recordedVideo.pause();
    recordedVideo.removeAttribute("src");
    recordedVideo.load();
    clearImagePreview();
    recordedVideo.controls = true;

    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
    }

    recordingUrl = null;
    recordingBlob = null;
    recordedChunks = [];
    isImagePreview = false;
    previewSource = "recording";
    setPreviewActionsEnabled(false);

    // Preview navigation must not release the current camera stream.
    if (mediaStream) {
      liveCameraSection.hidden = false;
      cameraVideo.play().catch(() => {});
    } else {
      // This only covers an unexpected missing stream; avoid showing the permission card again.
      permissionOverlay.hidden = hasCameraPermission;
      await startCamera();
    }
    recordButton.focus();
  }

  /** Explains that draft persistence needs a future backend integration. */
  function saveDraft() {
    alert("Draft saving requires backend integration.");
  }

  /** Builds a hidden picker for gallery and upload actions. */
  function openGallery(source = "gallery") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,image/*";
    input.hidden = true;
    input.addEventListener("change", () => {
      const [file] = input.files;
      input.remove();

      if (!file) {
        return;
      }

      recordingBlob = file;
      replaceRecordingUrl(URL.createObjectURL(file));
      previewSource = source;
      isImagePreview = file.type.startsWith("image/");
      recordedVideo.controls = !isImagePreview;

      if (isImagePreview) {
        showImagePreview(recordingUrl);
      } else {
        clearImagePreview();
      }
      showPreview();
    }, { once: true });
    input.addEventListener("cancel", () => {
      input.remove();
      // Cancelling a picker leaves the current camera session untouched.
    }, { once: true });
    document.body.append(input);
    input.click();
  }

  /** Updates selected mode, keeping MediaRecorder exclusive to Video mode. */
  function selectMode(button) {
    selectedMode = button.textContent.trim();
    modeButtons.forEach((modeButton) => {
      modeButton.setAttribute("aria-pressed", String(modeButton === button));
    });
    recordButton.disabled = selectedMode === "LIVE";
    if (selectedMode === "LIVE") {
      alert("LIVE streaming requires backend integration.");
    }
    console.info(`${selectedMode} Mode Selected`);
  }

  /** Connects UI-only camera enhancement tools to clear explanatory messages. */
  function bindComingSoonButtons() {
    const topTools = {
      "flash-button": "Flash will be implemented in a future update.",
      "speed-button": "Speed will be implemented in a future update.",
      "beauty-button": "Beauty will be implemented in a future update.",
      "filters-button": "Filters will be implemented in a future update.",
      "timer-button": "Timer will be implemented in a future update.",
      "green-screen-button": "Green Screen will be implemented in a future update.",
      "settings-button": "Settings will be implemented in a future update."
    };
    const rightTools = {
      "effects-button": "Effects will be implemented in a future update.",
      "templates-button": "Templates will be implemented in a future update.",
      "voice-effects-button": "Voice Effects will be implemented in a future update.",
      "retouch-button": "Retouch will be implemented in a future update.",
      "ai-enhance-button": "AI Enhance will be implemented in a future update."
    };

    [...Object.entries(topTools), ...Object.entries(rightTools)].forEach(([id, message]) => {
      document.getElementById(id)?.addEventListener("click", () => alert(message));
    });
  }

  // Event listeners
  enableCameraButton.addEventListener("click", startCamera);
  recordButton.addEventListener("click", () => {
    if (mediaRecorder?.state === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  });
  [flipCameraButton, toolbarFlipCameraButton].forEach((button) => button.addEventListener("click", switchCamera));
  galleryButton.addEventListener("click", () => openGallery("gallery"));
  uploadButton.addEventListener("click", () => openGallery("upload"));
  retakeButton.addEventListener("click", retakeRecording);
  closePreviewButton.addEventListener("click", retakeRecording);
  downloadButton.addEventListener("click", downloadVideo);
  saveDraftButton.addEventListener("click", saveDraft);
  nextButton.addEventListener("click", () => {
    if (previewSource === "upload") {
      retakeRecording();
      return;
    }
    alert("Uploading video requires backend integration.");
  });
  uploadStoryButton.addEventListener("click", () => alert("Story upload requires backend integration."));
  closeButton.addEventListener("click", () => {
    stopCamera();
    permissionOverlay.hidden = false;
  });
  modeButtons.forEach((button) => button.addEventListener("click", () => selectMode(button)));
  bindComingSoonButtons();

  // Keep only the primary bottom-right flip action from the supplied duplicate controls.
  toolbarFlipCameraButton.remove();

  // Ensure camera hardware is released when navigating away or reloading.
  window.addEventListener("pagehide", () => {
    if (mediaRecorder?.state === "recording") {
      mediaRecorder.stop();
    }
    clearRecordingIndicators();
    stopCamera();
  });

  initializeCamera();
})();

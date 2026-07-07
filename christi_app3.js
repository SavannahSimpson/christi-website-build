const RECIPIENT_EMAIL = "savannah.simpson@live.ca";
const PASSCODE = "i'm ready";

function checkPasscode() {
  const input = document.getElementById("passcode-input");
  const val = input.value.trim().toLowerCase();
  if (val === PASSCODE) {
    try { sessionStorage.setItem("christiUnlocked", "1"); } catch (e) {}
    document.getElementById("screen-passcode").style.display = "none";
    document.getElementById("screen-intro").style.display = "block";
  } else {
    document.getElementById("passcode-error").textContent = "That's not quite it, give it another try.";
    input.value = "";
    input.focus();
  }
}

function handlePasscodeKey(e) {
  if (e.key === "Enter") checkPasscode();
}

(function initGate() {
  let unlocked = false;
  try { unlocked = sessionStorage.getItem("christiUnlocked") === "1"; } catch (e) {}
  if (unlocked) {
    document.getElementById("screen-passcode").style.display = "none";
    document.getElementById("screen-intro").style.display = "block";
  }
})();

const items = [];
CHAPTERS.forEach(function (ch, ci) {
  ch.prompts.forEach(function (p, pi) {
    items.push({ chapterIndex: ci, tag: ch.tag, title: ch.title, intro: ch.intro, isFirstInChapter: pi === 0, text: p });
  });
});
const answers = new Array(items.length).fill("");
let current = 0;

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let recognizing = false;
let micBaseText = "";
let micQuestionIndex = -1;

function begin() {
  document.getElementById("screen-intro").style.display = "none";
  document.getElementById("screen-question").style.display = "block";
  current = 0;
  if (!SpeechRecognitionCtor) {
    document.getElementById("mic-btn").style.display = "none";
    document.getElementById("mic-unsupported").style.display = "inline";
  }
  render();
}

function render() {
  const item = items[current];
  const q = document.getElementById("screen-question");
  q.classList.remove("fade"); void q.offsetWidth; q.classList.add("fade");

  document.getElementById("progress-label").textContent = "Question " + (current + 1) + " of " + items.length + " · " + item.title;
  document.getElementById("bar-fill").style.width = Math.round((current / items.length) * 100) + "%";

  let chapterHtml = "";
  if (item.isFirstInChapter) {
    chapterHtml = '<div class="eyebrow">' + item.tag + '</div><h2>' + item.title + '</h2><div class="chapter-intro">' + item.intro + '</div>';
  }
  document.getElementById("chapter-block").innerHTML = chapterHtml;
  document.getElementById("prompt-text").textContent = item.text;
  document.getElementById("answer-box").value = answers[current];
  document.getElementById("back-btn").style.visibility = current === 0 ? "hidden" : "visible";
  document.getElementById("next-btn").textContent = current === items.length - 1 ? "Finish →" : "Next →";
  document.getElementById("mic-status").textContent = "";
  updateMicUI();
  document.getElementById("answer-box").focus();
}

function saveCurrent() {
  answers[current] = document.getElementById("answer-box").value;
}

function goNext() {
  abortRecognition();
  saveCurrent();
  if (current < items.length - 1) {
    current++;
    render();
  } else {
    showSummary();
  }
}

function goBack() {
  abortRecognition();
  saveCurrent();
  if (current > 0) {
    current--;
    render();
  }
}

function updateMicUI() {
  const btn = document.getElementById("mic-btn");
  const label = document.getElementById("mic-label");
  if (recognizing) {
    btn.classList.add("recording");
    label.textContent = "Listening, tap to stop";
  } else {
    btn.classList.remove("recording");
    label.textContent = "Speak your answer";
  }
}

function stopRecognition() {
  if (recognition && recognizing) {
    recognition.stop();
  }
}

// Used when navigating away from a question (Next/Back). Unlike stop(), abort()
// discards any not-yet-delivered result immediately, so speech from the question
// being left can never land in the textarea of the question being shown next.
function abortRecognition() {
  if (recognition && recognizing) {
    recognition.abort();
  }
  recognizing = false;
}

// --- Light, fully local cleanup for speech-to-text answers only. ---
// Nothing here ever leaves the browser, and typed answers are never touched,
// this only runs on text that came from the mic. It handles capitalization,
// filler words, and sentence breaks between pauses, it is not a full grammar
// checker (it won't fix verb tense, word choice, or real spelling mistakes).
function stripFillerWords(s) {
  return s.replace(/\b(um+|uh+|erm+|er)\b/gi, "").replace(/\s{2,}/g, " ").trim();
}

function capitalizeStandaloneI(s) {
  return s.replace(/\bi\b/g, "I");
}

function cleanSpokenChunk(raw) {
  let s = stripFillerWords(raw);
  if (!s) return "";
  s = capitalizeStandaloneI(s);
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}

// Appends one finalized speech chunk onto the accumulated answer, adding the
// sentence break (period + capital) between chunks that recognition itself
// doesn't provide, since each finalized chunk roughly corresponds to a pause.
function appendCleanedChunk(base, rawChunk) {
  const cleaned = cleanSpokenChunk(rawChunk);
  if (!cleaned) return base;
  let b = base.replace(/\s+$/, "");
  if (b && !/[.!?]$/.test(b)) b += ".";
  if (b) b += " ";
  return b + cleaned + " ";
}

function finalizePunctuation(s) {
  const t = s.replace(/\s+$/, "");
  if (!t) return t;
  return /[.!?]$/.test(t) ? t : t + ".";
}

function toggleMic() {
  if (!SpeechRecognitionCtor) return;
  if (recognizing) {
    stopRecognition();
    return;
  }
  const box = document.getElementById("answer-box");
  micQuestionIndex = current;
  micBaseText = box.value.replace(/\s+$/, "");
  if (micBaseText && !/[.!?]$/.test(micBaseText)) micBaseText += ".";
  if (micBaseText) micBaseText += " ";

  recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = function () {
    recognizing = true;
    updateMicUI();
  };
  recognition.onresult = function (e) {
    if (current !== micQuestionIndex) return; // stale result from a question we've since left
    let interimText = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const transcript = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        micBaseText = appendCleanedChunk(micBaseText, transcript);
      } else {
        interimText += transcript;
      }
    }
    box.value = micBaseText + interimText;
  };
  recognition.onerror = function (e) {
    recognizing = false;
    updateMicUI();
    if (current !== micQuestionIndex) return; // we've since moved to a different question
    const status = document.getElementById("mic-status");
    if (e.error === "not-allowed" || e.error === "permission-denied") {
      status.textContent = "Microphone access was blocked. Typing works fine instead.";
    } else if (e.error === "no-speech") {
      status.textContent = "Didn't catch anything, tap to try again.";
    }
  };
  recognition.onend = function () {
    recognizing = false;
    updateMicUI();
    if (current === micQuestionIndex) {
      box.value = finalizePunctuation(box.value);
    }
  };
  recognition.start();
}

function showSummary() {
  document.getElementById("screen-question").style.display = "none";
  document.getElementById("screen-summary").style.display = "block";
  const list = document.getElementById("qa-list");
  let html = "";
  let lastChapter = -1;
  items.forEach(function (item, i) {
    if (item.chapterIndex !== lastChapter) {
      html += '<div class="qa-chapter">' + item.title + '</div>';
      lastChapter = item.chapterIndex;
    }
    const ans = answers[i] && answers[i].trim() ? answers[i] : "(left blank)";
    const emptyClass = answers[i] && answers[i].trim() ? "" : " empty";
    html += '<div class="qa-block"><div class="qa-q">' + item.text + '</div><div class="qa-a' + emptyClass + '">' + escapeHtml(ans) + '</div></div>';
  });
  list.innerHTML = html;
}

function backToQuestions() {
  document.getElementById("screen-summary").style.display = "none";
  document.getElementById("screen-question").style.display = "block";
  render();
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function compileText() {
  let out = "What's Already Here - A Discovery Conversation\nPrepared for Christi, by Savannah\n\n";
  let lastChapter = -1;
  items.forEach(function (item, i) {
    if (item.chapterIndex !== lastChapter) {
      out += "\n== " + item.title + " ==\n\n";
      lastChapter = item.chapterIndex;
    }
    out += "Q: " + item.text + "\nA: " + (answers[i] && answers[i].trim() ? answers[i] : "(left blank)") + "\n\n";
  });
  return out;
}

function buildMailto(recipient, subject, body) {
  return "mailto:" + encodeURIComponent(recipient) +
    "?subject=" + encodeURIComponent(subject) +
    "&body=" + encodeURIComponent(body);
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

function emailAll() {
  const text = compileText();
  const subject = "Christi - Discovery Conversation Answers";
  const shortBody = "Hi Savannah, my answers are copied to my clipboard, paste them below this line. ----------";
  const warningEl = document.getElementById("email-warning");

  copyTextToClipboard(text).then(function () {
    warningEl.style.display = "block";
    warningEl.textContent = "Your email app is opening now, everything is already copied to your clipboard. Paste it in (Ctrl+V or Cmd+V) below the line, then hit send.";
    const link = buildMailto(RECIPIENT_EMAIL, subject, shortBody);
    window.location.href = link;
  });
}

function copyAll() {
  copyTextToClipboard(compileText()).then(showToast);
}

function showToast() {
  const t = document.getElementById("toast");
  t.classList.add("show");
  setTimeout(function () { t.classList.remove("show"); }, 1800);
}

function downloadAll() {
  const text = compileText();
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Christi - Discovery Conversation Answers.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

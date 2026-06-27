async function loadSentences() {
    const response = await fetch('audio/index.json');
    const data = await response.json();

    const container = document.getElementById('sentences');

    // المرور على كل العناصر داخل JSON
    Object.entries(data).forEach(([text, path]) => {
        const btn = document.createElement('button');
        btn.textContent = text; // الجملة أو الكلمة
        btn.onclick = () => playSound(path); // مسار الصوت
        container.appendChild(btn);
    });
}

function playSound(path) {
    const audio = new Audio(`audio/${path}`);
    audio.play();
}

loadSentences();

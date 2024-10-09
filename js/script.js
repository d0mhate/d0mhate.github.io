const canvas = document.getElementById('matrix');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%';
const fontSize = 16;
const columns = Math.floor(canvas.width / fontSize);

const drops = [];

for (let x = 0; x < columns; x++) {
    drops[x] = Math.floor(Math.random() * canvas.height / fontSize);
}

let frameCount = 0;
const speed = 5;

function drawMatrix() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F0';
    ctx.font = `${fontSize}px monospace`;

    frameCount++;

    if (frameCount % speed === 0) {
        for (let i = 0; i < drops.length; i++) {
            const text = symbols.charAt(Math.floor(Math.random() * symbols.length));
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }

            drops[i]++;
        }
    }

    requestAnimationFrame(drawMatrix);
}

drawMatrix();

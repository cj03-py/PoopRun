/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, RotateCcw, Play } from 'lucide-react';

const WIN_SCORE = 2600;
const GRAVITY = 0.6;
const JUMP_FORCE = -13;
const INITIAL_SPEED = 6;
const SPEED_INCREMENT = 0.0005;

// Asset mapping
const ASSETS = {
  player: 'ASSETS/character.png',
  lasagna: 'ASSETS/lasagna.png',
  broccoli: 'ASSETS/brocoli.png',
  boston: 'ASSETS/boston.png',
  schnauzer: 'ASSETS/schnauzer.png',
  winBg: 'ASSETS/winBG.png',
  pugFinal: 'ASSETS/PugFinal.png',
};

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  image: HTMLImageElement;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<'IDLE' | 'PLAYING' | 'GAMEOVER' | 'WON'>('IDLE');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio('https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3'); // Cheerful track
    if (audioRef.current) {
      audioRef.current.loop = true;
      audioRef.current.volume = 0.4;
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle Music Playback based on Game State
  useEffect(() => {
    if (!audioRef.current) return;

    if (gameState === 'PLAYING') {
      audioRef.current.play().catch(e => console.log('Audio playback failed (usually requires interaction first):', e));
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [gameState]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Game Refs to avoid re-renders during loop
  const gameData = useRef({
    player: {
      y: 0,
      vy: 0,
      width: 140,
      height: 140,
      isJumping: false,
      jumpsCount: 0,
    },
    obstacles: [] as (GameObject & { type: string })[],
    groundX: 0,
    mountainsX: 0,
    speed: INITIAL_SPEED,
    lastObstacleTime: 0,
    score: 0,
    images: {} as Record<string, HTMLImageElement>,
    frameId: 0,
  });

  // Preload Images
  useEffect(() => {
    const loadImage = (src: string) => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        // Add absolute path and referrerPolicy if it were an element, 
        // but for Image() we rely on browser behavior. 
        // However, we can create an actual element to be safe.
        const imgElement = document.createElement('img');
        imgElement.referrerPolicy = 'no-referrer';
        imgElement.src = src.startsWith('http') ? src : `/${src}`;
        imgElement.onload = () => resolve(imgElement);
        imgElement.onerror = () => {
          console.error(`Failed to load image: ${src}`);
          // Create a placeholder if it fails to avoid breaking the game
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = 'magenta';
            ctx.fillRect(0, 0, 64, 64);
          }
          const placeholder = new Image();
          placeholder.src = canvas.toDataURL();
          resolve(placeholder);
        };
      });
    };

    const assetsToLoad = [
      ASSETS.player,
      ASSETS.lasagna,
      ASSETS.broccoli,
      ASSETS.boston,
      ASSETS.schnauzer,
      ASSETS.pugFinal,
      ASSETS.winBg,
    ];

    Promise.all(assetsToLoad.map(loadImage)).then(([p, l, b, bo, s, pf, wb]) => {
      gameData.current.images = {
        player: p,
        lasagna: l,
        broccoli: b,
        boston: bo,
        schnauzer: s,
        pugFinal: pf,
        winBg: wb,
      };
      // Once images are loaded, force a redraw if IDLE
      if (gameState === 'IDLE') draw();
    });
  }, []);

  const resetGame = useCallback(() => {
    const canvas = canvasRef.current;
    const initialHeight = canvas ? canvas.height - 230 : 150;
    gameData.current.player.y = initialHeight;
    gameData.current.player.vy = 0;
    gameData.current.obstacles = [];
    gameData.current.speed = INITIAL_SPEED;
    gameData.current.score = 0;
    gameData.current.lastObstacleTime = 0;
    setScore(0);
    setGameState('PLAYING');
  }, []);

  const jump = useCallback(() => {
    if (gameState !== 'PLAYING') {
      if (gameState === 'GAMEOVER' || gameState === 'IDLE') resetGame();
      return;
    }
    const p = gameData.current.player;
    if (p.jumpsCount < 2) {
      p.vy = JUMP_FORCE;
      p.jumpsCount++;
      p.isJumping = true;
    }
  }, [gameState, resetGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') jump();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump]);

  const update = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const data = gameData.current;
    const p = data.player;

    // Win condition check FIRST
    if (data.score >= WIN_SCORE) {
        setGameState('WON');
        const finalScore = Math.floor(data.score);
        if (finalScore > highScore) {
            setHighScore(finalScore);
            localStorage.setItem('pugHighscore', finalScore.toString());
        }
        return;
    }

    // Movement & Gravity
    p.vy += GRAVITY;
    p.y += p.vy;

    // Floor collision
    const groundY = canvas.height - 90;
    if (p.y > groundY - p.height) {
      p.y = groundY - p.height;
      p.vy = 0;
      p.isJumping = false;
      p.jumpsCount = 0;
    }

    // Scroll speed
    data.speed += SPEED_INCREMENT;
    data.groundX = (data.groundX - data.speed) % canvas.width;
    data.mountainsX = (data.mountainsX - data.speed * 0.3) % canvas.width;

    // Obstacles
    const now = Date.now();
    if (now - data.lastObstacleTime > 2000 / (data.speed / 5)) {
      const obstacleTypes = ['lasagna', 'broccoli', 'boston', 'schnauzer'];
      const type = obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
      
      const isDog = type === 'boston' || type === 'schnauzer';
      const obsHeight = isDog ? 160 : 60;

      data.obstacles.push({
        x: canvas.width,
        y: groundY - obsHeight,
        width: 50,
        height: obsHeight,
        image: data.images[type],
        type,
      });
      data.lastObstacleTime = now;
    }

    // Update obstacles and collision
    for (let i = data.obstacles.length - 1; i >= 0; i--) {
      const obs = data.obstacles[i];
      obs.x -= data.speed;

      // Collision detection (smaller hitboxes for easier gameplay)
      const isLasagna = obs.type === 'lasagna';
      const isDog = obs.type === 'boston' || obs.type === 'schnauzer';
      const buffer = isDog ? 45 : (isLasagna ? 35 : 25); 
      const aspect = obs.image ? obs.image.width / obs.image.height : 1;
      
      const obsHeight = isDog ? 160 : 60;
      const obsWidth = obsHeight * aspect;
      
      // Sink dogs a bit if they have transparency at the bottom
      const sinkY = isDog ? 40 : 0;
      const hitboxY = obs.y + sinkY;

      if (
        obs.x < 50 + p.width - buffer &&
        obs.x + obsWidth > 50 + buffer &&
        hitboxY < p.y + p.height - buffer &&
        hitboxY + obsHeight > p.y + buffer
      ) {
        setGameState('GAMEOVER');
        if (Math.floor(data.score) > highScore) {
            const newHigh = Math.floor(data.score);
            setHighScore(newHigh);
            localStorage.setItem('pugHighscore', newHigh.toString());
        }
        return;
      }

      if (obs.x < -obsWidth) {
        data.obstacles.splice(i, 1);
      }
    }

    // Score
    data.score += 0.5; // Adjusted score speed
    setScore(Math.floor(data.score));
  };

  // Persist highscore
  useEffect(() => {
    const saved = localStorage.getItem('pugHighscore');
    if (saved) setHighScore(parseInt(saved));
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const data = gameData.current;
    ctx.imageSmoothingEnabled = false;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background Sky (White Theme)
    ctx.fillStyle = '#FFFFFF'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sun (Theme Pixel style - Pinkish Yellow)
    ctx.fillStyle = '#FFF5EE'; // Seashell (Warm white)
    ctx.fillRect(canvas.width - 120, 40, 70, 70);
    ctx.fillStyle = '#FFB6C1'; // Light Pink Shadow
    ctx.fillRect(canvas.width - 116, 44, 70, 70);
    ctx.fillStyle = '#FFF5EE';
    ctx.fillRect(canvas.width - 120, 40, 70, 70);

    // Mountains (Pinkish shades)
    const mountainSpacing = 400;
    const mountainCount = Math.ceil(canvas.width / mountainSpacing) + 2;
    for (let i = 0; i < mountainCount; i++) {
        const offset = (data.mountainsX + i * mountainSpacing) % (canvas.width + mountainSpacing) - mountainSpacing;
        const baseY = canvas.height - 90;
        
        ctx.fillStyle = '#DB7093'; // Pale Violet Red
        ctx.beginPath();
        ctx.moveTo(offset, baseY);
        ctx.lineTo(offset + 150, baseY - 180);
        ctx.lineTo(offset + 300, baseY);
        ctx.fill();

        // Mountain Peak
        ctx.fillStyle = '#C71585'; // Medium Violet Red
        ctx.beginPath();
        ctx.moveTo(offset + 75, baseY - 90);
        ctx.lineTo(offset + 150, baseY - 180);
        ctx.lineTo(offset + 225, baseY - 90);
        ctx.fill();
    }

    // Ground (Pink shades)
    const groundHeight = 90;
    const groundTop = canvas.height - groundHeight;
    ctx.fillStyle = '#FF69B4'; // Hot Pink
    ctx.fillRect(0, groundTop, canvas.width, groundHeight);
    
    ctx.fillStyle = '#FF1493'; // Deep Pink Top border
    ctx.fillRect(0, groundTop, canvas.width, 8);

    // Dirt Specs (Pink theme detail)
    ctx.fillStyle = '#C71585';
    const dirtSpacing = 200;
    const dirtCount = Math.ceil(canvas.width / dirtSpacing) + 1;
    for (let i = 0; i < dirtCount; i++) {
        const x = (data.groundX + i * dirtSpacing + 50) % (canvas.width + dirtSpacing) - dirtSpacing;
        ctx.fillRect(x, groundTop + 30, 8, 8);
        ctx.fillRect(x + 100, groundTop + 60, 8, 8);
    }

    // Final Stretch - Meta y Pug Final
    if (data.score > WIN_SCORE - 300) {
        const metaBaseX = (WIN_SCORE - data.score) * 20; // 20px per point left
        
        // Finish line (Chequered pattern)
        for (let i = 0; i < 15; i++) {
            ctx.fillStyle = i % 2 === 0 ? 'white' : 'black';
            ctx.fillRect(metaBaseX, groundTop - 200 + i * 20, 15, 20);
        }

        // Pug Final Waiting
        if (data.images.pugFinal) {
            const h = 160;
            const aspect = data.images.pugFinal.width / data.images.pugFinal.height;
            const w = h * aspect;
            const sinkY = 40;
            ctx.drawImage(data.images.pugFinal, metaBaseX + 50, groundTop - h + sinkY, w, h);
        }
    }

    // Player
    if (data.images.player && data.images.player.width > 0 && !data.images.player.src.includes('data:image')) {
      const bounce = !data.player.isJumping ? Math.sin(data.score * 0.3) * 4 : 0;
      ctx.drawImage(data.images.player, 50, data.player.y + bounce, data.player.width, data.player.height);
    } else {
      // Fallback Pixel Pug (from theme)
      const bounce = !data.player.isJumping ? Math.sin(data.score * 0.3) * 4 : 0;
      const x = 50;
      const y = data.player.y + bounce;
      const size = 6;
      ctx.fillStyle = '#D2B48C'; // Base pug color
      
      const pixels = [
        [1,0],[2,0],[3,0],[4,0],
        [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1, '#000'],
        [0,2],[1,2],[2,2],[3,2],[4,2],[5,2, '#000'],[6,2, '#000'],[7,2, '#000'],
        [0,3],[1,3],[2,3],[3,3],[4,3],[5,3, '#000'],[6,3, '#000'],
        [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],
        [1,5, '#000'],[4,5, '#000']
      ];

      pixels.forEach(([px, py, color]) => {
        ctx.fillStyle = (color as string) || '#D2B48C';
        ctx.fillRect(x + (px as number) * size, y + (py as number) * size, size, size);
      });
      // Pink bow
      ctx.fillStyle = '#FF69B4';
      ctx.fillRect(x + 2 * size, y - 1 * size, size * 2, size);
    }

    // Obstacles
    data.obstacles.forEach((obs) => {
      if (obs.image && obs.image.width > 0 && !obs.image.src.includes('data:image')) {
        const aspect = obs.image.width / obs.image.height;
        const isDog = obs.type === 'boston' || obs.type === 'schnauzer';
        const h = isDog ? 160 : 70;
        const w = h * aspect;
        const sinkY = isDog ? 40 : 0;
        ctx.drawImage(obs.image, obs.x, groundTop - h + sinkY, w, h);
      } else {
        // Fallback obstacles
        ctx.fillStyle = '#8B4513';
        if (obs.type === 'lasagna') {
            ctx.fillStyle = '#FFA500';
            ctx.fillRect(obs.x, groundTop - 40, 50, 40);
            ctx.fillStyle = '#FFFF00';
            ctx.fillRect(obs.x, groundTop - 25, 50, 5);
        } else if (obs.type === 'broccoli') {
            ctx.fillStyle = '#228B22';
            ctx.beginPath();
            ctx.arc(obs.x + 25, groundTop - 40, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(obs.x + 20, groundTop - 20, 10, 20);
        } else {
            // Dog friends
            ctx.fillStyle = obs.type === 'boston' ? '#000' : '#808080';
            ctx.fillRect(obs.x, groundTop - 50, 50, 50);
            ctx.fillStyle = 'white';
            ctx.fillRect(obs.x + 10, groundTop - 40, 10, 10);
            ctx.fillRect(obs.x + 30, groundTop - 40, 10, 10);
            // Speech bubble indication
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.ellipse(obs.x + 25, groundTop - 70, 25, 15, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'black';
            ctx.font = '8px monospace';
            ctx.fillText(obs.type === 'boston' ? 'CASI!' : 'PUEDES!', obs.x + 5, groundTop - 68);
        }
      }
    });
  };

  useEffect(() => {
    if (gameState === 'PLAYING') {
      const loop = () => {
        update();
        draw();
        gameData.current.frameId = requestAnimationFrame(loop);
      };
      gameData.current.frameId = requestAnimationFrame(loop);
    } else {
      draw();
      cancelAnimationFrame(gameData.current.frameId);
    }
    return () => cancelAnimationFrame(gameData.current.frameId);
  }, [gameState]);

  return (
    <div className="relative w-full h-screen bg-white overflow-hidden font-mono select-none">
      <div 
        className="relative w-full h-full cursor-pointer"
        onClick={jump}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full h-full block"
          style={{ imageRendering: 'pixelated' }}
        />

        {/* HUD (Pink Style) */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-start pointer-events-none">
            <div className="bg-pink-900/40 border-4 border-white px-4 py-2 text-white font-bold text-2xl shadow-[4px_4px_0_rgba(0,0,0,1)]">
                PUNTOS: {score}
            </div>
            <div className="flex flex-col gap-2 items-end">
                <div className="bg-pink-900/40 border-4 border-white px-4 py-2 text-white font-bold text-xl shadow-[4px_4px_0_rgba(0,0,0,1)]">
                    META: {WIN_SCORE}
                </div>
                <div className="bg-pink-900/40 border-4 border-white px-3 py-1 text-pink-200 font-bold text-xs shadow-[2px_2px_0_rgba(0,0,0,1)]">
                    RECORD: {highScore}
                </div>
            </div>
        </div>

        {/* UI Overlays */}
        <AnimatePresence>
          {gameState === 'IDLE' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-pink-900/50 backdrop-blur-sm flex flex-col items-center justify-center text-white p-4"
            >
              <div className="bg-pink-800/40 border-8 border-white p-6 md:p-12 flex flex-col items-center shadow-[10px_10px_0_rgba(0,0,0,0.5)] max-w-sm md:max-w-none w-full md:w-auto">
                <motion.h1 
                    initial={{ y: -20 }}
                    animate={{ y: 0 }}
                    className="text-4xl md:text-6xl font-black mb-4 md:mb-6 text-center leading-none tracking-tighter italic"
                    style={{ textShadow: '4px 4px 0 #000' }}
                >
                    PUG RUN<br/><span className="text-pink-300">2600</span>
                </motion.h1>
                <p className="text-base md:text-xl mb-6 md:mb-10 font-bold opacity-90 text-center max-w-sm" style={{ textShadow: '2px 2px 0 #000' }}>
                    ¡Llega a los 2600 puntos para celebrar el cumplemes!
                </p>
                <button 
                    onClick={(e) => { e.stopPropagation(); resetGame(); }}
                    className="px-6 py-3 md:px-10 md:py-5 bg-pink-500 hover:bg-pink-400 text-white font-black text-xl md:text-2xl border-4 border-white shadow-[6px_6px_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-1 active:translate-y-0 flex items-center gap-3 w-full md:w-auto justify-center"
                >
                    <Play fill="currentColor" size={24} /> EMPEZAR
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'GAMEOVER' && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute inset-0 bg-pink-950/40 backdrop-blur-md flex flex-col items-center justify-center text-white p-4"
            >
               <div className="bg-pink-900/60 border-8 border-white p-6 md:p-12 flex flex-col items-center shadow-[10px_10px_0_rgba(0,0,0,0.5)] max-w-sm md:max-w-none w-full md:w-auto">
                <h2 className="text-5xl md:text-7xl font-black mb-2 md:mb-4 italic text-center" style={{ textShadow: '4px 4px 0 #000' }}>Perdiste!</h2>
                <p className="text-xl md:text-2xl mb-6 md:mb-8 font-bold" style={{ textShadow: '2px 2px 0 #000' }}>Puntaje: {score}</p>
                <button 
                    onClick={(e) => { e.stopPropagation(); resetGame(); }}
                    className="px-6 py-3 md:px-10 md:py-5 bg-white text-pink-600 font-black text-xl md:text-2xl border-4 border-pink-600 shadow-[6px_6px_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-1 active:translate-y-0 flex items-center gap-3 w-full md:w-auto justify-center"
                >
                    <RotateCcw size={24} /> REINTENTAR
                </button>
              </div>
            </motion.div>
          )} 

          {gameState === 'WON' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-50 overflow-hidden bg-white"
            >
              <img 
                src={`/${ASSETS.winBg}`} 
                referrerPolicy="no-referrer" 
                className="w-full h-full object-cover" 
                alt="Win Background" 
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 md:pb-12 px-4">
                  <button 
                    onClick={(e) => { e.stopPropagation(); resetGame(); }}
                    className="px-8 py-4 md:px-12 md:py-6 bg-pink-500 hover:bg-pink-400 text-white font-black text-xl md:text-4xl border-4 border-white shadow-[6px_6px_0_rgba(0,0,0,1)] transition-transform hover:-translate-y-1 active:translate-y-0 uppercase tracking-tighter"
                  >
                    Volver a jugar
                  </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-6 w-full text-center text-pink-600/30 text-xs font-mono tracking-[0.3em] uppercase pointer-events-none">
        SOLO LOS MEJORES LLEGAN AL PUG FINAL
      </div>
    </div>
  );
}

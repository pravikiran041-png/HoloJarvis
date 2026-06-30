import { useState, useEffect } from 'react';

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6]             // diags
];

export function TicTacToe() {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [winner, setWinner] = useState(null);
  const [isMinimized, setIsMinimized] = useState(true); // Minimized by default so it doesn't clutter

  const checkWinner = (squares) => {
    for (let i = 0; i < WINNING_LINES.length; i++) {
      const [a, b, c] = WINNING_LINES[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    if (!squares.includes(null)) return 'Draw';
    return null;
  };

  const getJarvisMove = (squares) => {
    // 1. Win
    for (let i = 0; i < WINNING_LINES.length; i++) {
      const [a, b, c] = WINNING_LINES[i];
      if (squares[a] === 'O' && squares[b] === 'O' && !squares[c]) return c;
      if (squares[a] === 'O' && squares[c] === 'O' && !squares[b]) return b;
      if (squares[b] === 'O' && squares[c] === 'O' && !squares[a]) return a;
    }
    // 2. Block
    for (let i = 0; i < WINNING_LINES.length; i++) {
      const [a, b, c] = WINNING_LINES[i];
      if (squares[a] === 'X' && squares[b] === 'X' && !squares[c]) return c;
      if (squares[a] === 'X' && squares[c] === 'X' && !squares[b]) return b;
      if (squares[b] === 'X' && squares[c] === 'X' && !squares[a]) return a;
    }
    // 3. Center
    if (!squares[4]) return 4;
    // 4. Random
    const empty = squares.map((v, i) => v === null ? i : null).filter(v => v !== null);
    return empty[Math.floor(Math.random() * empty.length)];
  };

  const handleClick = (index) => {
    if (board[index] || winner || !isXNext) return;
    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);
    setIsXNext(false);
  };

  useEffect(() => {
    const currentWinner = checkWinner(board);
    if (currentWinner) {
      setWinner(currentWinner);
      return;
    }

    if (!isXNext && !currentWinner) {
      const timer = setTimeout(() => {
        const move = getJarvisMove(board);
        const newBoard = [...board];
        newBoard[move] = 'O';
        setBoard(newBoard);
        setIsXNext(true);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [board, isXNext]);

  useEffect(() => {
    const handleJarvisMoveEvent = (e) => {
      const index = e.detail;
      if (index >= 0 && index <= 8 && isXNext && !winner && !board[index]) {
        setIsMinimized(false); // auto-open game if they speak a move
        const newBoard = [...board];
        newBoard[index] = 'X';
        setBoard(newBoard);
        setIsXNext(false);
      }
    };
    window.addEventListener('jarvis_ttt_move', handleJarvisMoveEvent);
    return () => window.removeEventListener('jarvis_ttt_move', handleJarvisMoveEvent);
  }, [board, isXNext, winner]);

  const resetGame = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
    setWinner(null);
  };

  if (isMinimized) {
    return (
      <div className="fixed left-8 bottom-8 z-40">
        <button 
          onClick={() => setIsMinimized(false)}
          className="bg-space-900/90 border border-holo-cyan/40 p-4 rounded-xl shadow-[0_0_20px_rgba(0,212,255,0.2)] text-holo-cyan hover:bg-space-800 transition-all backdrop-blur-md flex items-center gap-3 font-[family-name:var(--font-mono)] text-xs tracking-widest uppercase"
          title="Play Tic-Tac-Toe vs Jarvis"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
          </svg>
          MINIGAME
        </button>
      </div>
    );
  }

  return (
    <div className="fixed left-8 bottom-8 z-40 bg-space-900/90 border border-glass-border p-5 rounded-2xl shadow-[0_0_40px_rgba(0,212,255,0.15)] backdrop-blur-xl w-[280px] animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-[family-name:var(--font-display)] text-holo-cyan text-sm tracking-widest uppercase">
          Jarvis Tic-Tac-Toe
        </h3>
        <button 
          onClick={() => setIsMinimized(true)}
          className="text-text-dim hover:text-holo-red transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {board.map((cell, idx) => (
          <button
            key={idx}
            onClick={() => handleClick(idx)}
            className={`h-20 bg-space-800/50 border border-holo-cyan/10 rounded-xl flex items-center justify-center text-3xl font-[family-name:var(--font-display)] transition-all
              ${cell === 'X' ? 'text-neon-green shadow-[inset_0_0_15px_rgba(0,255,136,0.1)]' : ''}
              ${cell === 'O' ? 'text-holo-cyan shadow-[inset_0_0_15px_rgba(0,212,255,0.1)]' : ''}
              ${!cell && !winner && isXNext ? 'hover:bg-space-700/50 hover:border-holo-cyan/30 cursor-pointer' : 'cursor-default'}
            `}
            disabled={cell || winner || !isXNext}
          >
            {cell}
          </button>
        ))}
      </div>

      <div className="text-center font-[family-name:var(--font-mono)] text-xs tracking-wider mb-4 h-4">
        {winner === 'Draw' ? (
          <span className="text-neon-orange">DRAW DETECTED</span>
        ) : winner === 'X' ? (
          <span className="text-neon-green">YOU WIN, SIR.</span>
        ) : winner === 'O' ? (
          <span className="text-holo-red">I WIN THIS ROUND.</span>
        ) : isXNext ? (
          <span className="text-text-primary">YOUR TURN</span>
        ) : (
          <span className="text-holo-cyan animate-pulse">JARVIS IS THINKING...</span>
        )}
      </div>

      <button
        onClick={resetGame}
        className="w-full py-2 bg-holo-cyan/10 border border-holo-cyan/20 rounded-lg text-holo-cyan hover:bg-holo-cyan/20 transition-colors font-[family-name:var(--font-mono)] text-xs tracking-widest uppercase"
      >
        Reset Board
      </button>
    </div>
  );
}

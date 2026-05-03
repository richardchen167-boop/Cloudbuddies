import { motion } from 'framer-motion';
import { type Pet } from '../lib/supabase';

interface AnimatedPetProps {
  type: Pet['type'];
  isSleeping?: boolean;
  isHappy?: boolean;
  isSick?: boolean;
}

const petStyles: Record<string, { primary: string; secondary: string; accent: string }> = {
  cat: { primary: '#fb923c', secondary: '#fed7aa', accent: '#f97316' },
  dog: { primary: '#a8a29e', secondary: '#f5f5f4', accent: '#78716c' },
  fox: { primary: '#ea580c', secondary: '#fff', accent: '#9a3412' },
  dragon: { primary: '#22c55e', secondary: '#bbf7d0', accent: '#166534' },
  rabbit: { primary: '#e2e8f0', secondary: '#ffffff', accent: '#94a3b8' },
  default: { primary: '#94a3b8', secondary: '#cbd5e1', accent: '#475569' }
};

export const AnimatedPet = ({ type, isSleeping, isHappy, isSick }: AnimatedPetProps) => {
  const styles = petStyles[type] || petStyles.default;

  const bodyVariants = {
    idle: { scaleY: [1, 1.05, 1], transition: { duration: 2, repeat: Infinity, ease: "easeInOut" } },
    happy: { y: [0, -20, 0], transition: { duration: 0.4, repeat: Infinity } },
    sleeping: { opacity: 0.8, scale: 0.95 }
  };

  return (
    <div className="relative w-40 h-40 flex items-center justify-center">
      <motion.div 
        className="absolute bottom-2 w-20 h-3 bg-black/10 rounded-full blur-sm"
        animate={{ scale: isHappy ? [1, 0.8, 1] : [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      <motion.svg viewBox="0 0 200 200" className="w-full h-full"
        variants={bodyVariants}
        animate={isHappy ? "happy" : isSleeping ? "sleeping" : "idle"}>
        <motion.path d="M 140 140 Q 180 100 160 60" stroke={styles.primary} strokeWidth="10" fill="none" strokeLinecap="round"
          animate={{ rotate: isHappy ? [0, 20, 0] : [0, 5, 0] }} transition={{ duration: 0.5, repeat: Infinity }} />
        <ellipse cx="100" cy="135" rx="40" ry="45" fill={styles.primary} />
        <ellipse cx="100" cy="145" rx="20" ry="25" fill={styles.secondary} opacity="0.4" />
        <motion.g animate={{ y: isSleeping ? 2 : [0, -2, 0] }} transition={{ duration: 3, repeat: Infinity }}>
          <circle cx="100" cy="80" r="35" fill={styles.primary} />
          {isSleeping ? (
            <g stroke={styles.accent} strokeWidth="3" fill="none"><path d="M 75 80 Q 85 85 95 80" /><path d="M 105 80 Q 115 85 125 80" /></g>
          ) : (
            <g fill="#1e293b">
              <motion.circle cx="85" cy="80" r="4" animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity }} />
              <motion.circle cx="115" cy="80" r="4" animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ duration: 4, repeat: Infinity }} />
            </g>
          )}
          <circle cx="100" cy="90" r="5" fill={isSick ? "#94a3b8" : styles.accent} />
        </motion.g>
      </motion.svg>
    </div>
  );
};

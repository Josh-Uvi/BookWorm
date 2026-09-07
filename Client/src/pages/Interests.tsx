import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, Rocket, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useLocalStorage } from "@/hooks/useLocalStorage";

const interests = [
  { id: "animals", emoji: "🦁", label: "Animals", color: "from-orange-400 to-yellow-400" },
  { id: "space", emoji: "🚀", label: "Space", color: "from-blue-500 to-purple-500" },
  { id: "dinosaurs", emoji: "🦕", label: "Dinosaurs", color: "from-green-500 to-emerald-600" },
  { id: "ocean", emoji: "🐠", label: "Ocean Life", color: "from-cyan-400 to-blue-500" },
  { id: "magic", emoji: "✨", label: "Magic & Fantasy", color: "from-purple-400 to-pink-500" },
  { id: "sports", emoji: "⚽", label: "Sports", color: "from-red-400 to-orange-500" },
  { id: "art", emoji: "🎨", label: "Art & Crafts", color: "from-pink-400 to-rose-500" },
  { id: "music", emoji: "🎵", label: "Music", color: "from-indigo-400 to-purple-500" },
  { id: "science", emoji: "🔬", label: "Science", color: "from-teal-400 to-cyan-500" },
  { id: "adventure", emoji: "🏔️", label: "Adventure", color: "from-amber-500 to-orange-600" },
  { id: "robots", emoji: "🤖", label: "Robots & Tech", color: "from-slate-400 to-gray-600" },
  { id: "nature", emoji: "🌳", label: "Nature", color: "from-lime-400 to-green-500" },
];

export default function Interests() {
  const [selectedInterests, setSelectedInterests] = useLocalStorage<string[]>("user-interests", []);
  const [selected, setSelected] = useState<string[]>(selectedInterests);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    setSelected(selectedInterests);
  }, [selectedInterests]);

  const toggleInterest = (id: string) => {
    setSelected(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleContinue = () => {
    if (step === 1 && selected.length > 0) {
      setSelectedInterests(selected);
      setStep(2);
    } else if (step === 2) {
      navigate("/reading");
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-12 px-4 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <div className="container max-w-4xl mx-auto">
        {step === 1 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-block text-6xl"
              >
                🎉
              </motion.div>
              <h1 className="text-4xl md:text-5xl font-bold gradient-text">
                What Do You Love?
              </h1>
              <p className="text-xl text-muted-foreground">
                Pick all the things that make you excited!
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {interests.map((interest, index) => {
                const isSelected = selected.includes(interest.id);
                return (
                  <motion.button
                    key={interest.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleInterest(interest.id)}
                    className={`relative p-6 rounded-2xl border-4 transition-all ${
                      isSelected
                        ? "border-primary shadow-lg shadow-primary/50"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${interest.color} opacity-10`} />
                    <div className="relative space-y-2">
                      <div className="text-5xl">{interest.emoji}</div>
                      <div className="font-bold text-sm">{interest.label}</div>
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-2 -right-2"
                        >
                          <Star className="h-6 w-6 fill-primary text-primary" />
                        </motion.div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={handleContinue}
                disabled={selected.length === 0}
                className="text-lg px-8 py-6 rounded-full"
              >
                Continue <Sparkles className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8 py-12"
          >
            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block"
            >
              <Rocket className="h-32 w-32 text-primary" />
            </motion.div>
            
            <div className="space-y-4">
              <h1 className="text-5xl font-bold gradient-text">
                Awesome Choices!
              </h1>
              <p className="text-2xl text-muted-foreground">
                You picked {selected.length} amazing {selected.length === 1 ? "thing" : "things"}!
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-3 max-w-2xl mx-auto">
              {selected.map(id => {
                const interest = interests.find(i => i.id === id);
                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="px-4 py-2 rounded-full bg-primary/20 border-2 border-primary flex items-center gap-2"
                  >
                    <span className="text-2xl">{interest?.emoji}</span>
                    <span className="font-semibold">{interest?.label}</span>
                  </motion.div>
                );
              })}
            </div>

            <div className="space-y-4">
              <Button
                size="lg"
                onClick={handleContinue}
                className="text-lg px-8 py-6 rounded-full"
              >
                Start Reading! 📚
              </Button>
              <div>
                <Button
                  variant="ghost"
                  onClick={() => setStep(1)}
                  className="text-muted-foreground"
                >
                  Go Back
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

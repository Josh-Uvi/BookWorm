import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Sparkles, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DemoProfiles, getDemoProfile } from "@/data/demoProfiles";
import { StudentProfile } from "@/types";

interface StudentLoginProps {
  onLogin: (student: StudentProfile) => void;
}

export default function StudentLogin({ onLogin }: StudentLoginProps) {
  const [profileId, setProfileId] = useState("");
  const selectedProfile = getDemoProfile(profileId);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (selectedProfile) onLogin(selectedProfile);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-violet-600 via-fuchsia-500 to-amber-300 px-4 py-12">
      <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="absolute -right-24 bottom-12 h-80 w-80 rounded-full bg-yellow-200/40 blur-3xl" />
      <motion.section
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 w-full max-w-xl rounded-[2rem] border-4 border-white/50 bg-white/90 p-6 text-slate-900 shadow-2xl backdrop-blur md:p-10"
      >
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-lg">
          <BookOpen className="h-10 w-10 text-white" />
        </div>
        <div className="text-center">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-100 px-4 py-2 text-sm font-bold text-violet-700">
            <Sparkles className="h-4 w-4" /> Your reading adventure
          </p>
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">Who is reading today?</h1>
          <p className="mt-3 text-lg text-slate-600">Choose your reader profile and we’ll find books just for you.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block text-base font-bold" htmlFor="student-profile">Student profile</label>
          <Select value={profileId} onValueChange={setProfileId}>
            <SelectTrigger id="student-profile" className="h-16 rounded-2xl border-2 border-violet-200 bg-white px-5 text-left text-base shadow-sm">
              <SelectValue placeholder="Choose StudentA or StudentB" />
            </SelectTrigger>
            <SelectContent>
              {DemoProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id} className="py-3">
                  {profile.loginName} — Reading Level {profile.readingLevel} ({profile.readingLabel})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProfile && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-violet-50 p-4">
              <p className="font-bold text-violet-800">Level {selectedProfile.readingLevel}: {selectedProfile.readingLabel}</p>
              <p className="mt-1 text-sm text-slate-600">{selectedProfile.description}</p>
              <p className="mt-2 text-sm font-semibold text-fuchsia-700">Friendly voice: {selectedProfile.voice}</p>
            </motion.div>
          )}

          <Button type="submit" disabled={!selectedProfile} className="h-14 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-lg font-bold shadow-lg hover:opacity-90">
            Choose a Book <WandSparkles className="h-5 w-5" />
          </Button>
        </form>
      </motion.section>
    </main>
  );
}
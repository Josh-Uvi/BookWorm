import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  User, 
  Edit2, 
  Settings, 
  BookOpen, 
  Clock, 
  ChevronRight,
  Minus,
  Plus,
  Moon,
  Sun,
  Sparkles,
  Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useTheme } from "@/hooks/useTheme";
import { UserProfile, UserPreferences, ReadingProgress } from "@/types";
import { sampleBooks } from "@/data/sampleBooks";

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

const defaultProfile: UserProfile = {
  id: "user-1",
  name: "Reader",
  avatarUrl: "",
  bio: "Passionate reader exploring new worlds through books.",
};

const defaultPreferences: UserPreferences = {
  fontSize: 16,
  lineSpacing: 1.6,
  theme: "dark",
  readingLevel: "beginner",
};

const Profile = () => {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [profile, setProfile] = useLocalStorage<UserProfile>("user-profile", defaultProfile);
  const [preferences, setPreferences] = useLocalStorage<UserPreferences>("user-preferences", defaultPreferences);
  const [readingHistory] = useLocalStorage<ReadingProgress[]>("reading-history", []);
  const [selectedInterests, setSelectedInterests] = useLocalStorage<string[]>("user-interests", []);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(profile.name);
  const [editedBio, setEditedBio] = useState(profile.bio);

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSaveProfile = () => {
    setProfile({
      ...profile,
      name: editedName,
      bio: editedBio,
    });
    setIsEditing(false);
  };

  const getBookById = (bookId: string) => {
    return sampleBooks.find((book) => book.id === bookId);
  };

  return (
    <div className="min-h-screen bg-background pt-20">
      <div className="container px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-4xl"
        >
          {/* Profile Header */}
          <div className="glass-effect rounded-2xl p-8 mb-8">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Avatar className="h-24 w-24 border-4 border-primary/20">
                <AvatarImage src={profile.avatarUrl} alt={profile.name} />
                <AvatarFallback className="bg-gradient-primary text-2xl text-primary-foreground">
                  {profile.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 text-center sm:text-left">
                {isEditing ? (
                  <div className="space-y-4">
                    <Input
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      placeholder="Your name"
                      className="max-w-xs bg-surface border-border"
                    />
                    <Input
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      placeholder="Your bio"
                      className="bg-surface border-border"
                    />
                    <div className="flex gap-2">
                      <Button onClick={handleSaveProfile} size="sm">
                        Save
                      </Button>
                      <Button
                        onClick={() => setIsEditing(false)}
                        variant="outline"
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                      {profile.name}
                    </h1>
                    <p className="text-muted-foreground mb-4">{profile.bio}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditedName(profile.name);
                        setEditedBio(profile.bio);
                        setIsEditing(true);
                      }}
                      className="border-border hover:bg-surface"
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="interests" className="w-full">
            <TabsList className="w-full grid grid-cols-4 bg-surface mb-8">
              <TabsTrigger value="interests" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Sparkles className="h-4 w-4 mr-2" />
                Interests
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Clock className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
              <TabsTrigger value="profile" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <User className="h-4 w-4 mr-2" />
                Profile
              </TabsTrigger>
            </TabsList>

            {/* Interests Tab */}
            <TabsContent value="interests">
              <div className="glass-effect rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-6 flex items-center text-foreground">
                  <Sparkles className="h-5 w-5 mr-2 text-primary" />
                  Your Interests
                </h2>
                <p className="text-muted-foreground mb-6">
                  Select the topics you love! We'll use this to recommend books just for you.
                </p>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {interests.map((interest, index) => {
                    const isSelected = selectedInterests.includes(interest.id);
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
                
                {selectedInterests.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20"
                  >
                    <p className="text-sm text-foreground">
                      ✨ You've selected {selectedInterests.length} {selectedInterests.length === 1 ? 'interest' : 'interests'}!
                    </p>
                  </motion.div>
                )}
              </div>
            </TabsContent>

            {/* Reading History Tab */}
            <TabsContent value="history">
              <div className="glass-effect rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-6 flex items-center text-foreground">
                  <BookOpen className="h-5 w-5 mr-2 text-primary" />
                  Reading History
                </h2>
                
                {readingHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      No reading history yet. Start your first book!
                    </p>
                    <Button onClick={() => navigate("/reading")} className="bg-gradient-primary">
                      Browse Books
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {readingHistory.map((progress) => {
                      const book = getBookById(progress.bookId);
                      if (!book) return null;
                      
                      return (
                        <motion.div
                          key={progress.bookId}
                          whileHover={{ x: 5 }}
                          className="flex items-center gap-4 p-4 rounded-lg bg-surface hover:bg-surface-hover cursor-pointer"
                          onClick={() => navigate(`/reading?book=${book.id}`)}
                        >
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            className="h-16 w-12 rounded object-cover"
                          />
                          <div className="flex-1">
                            <h3 className="font-medium text-foreground">{book.title}</h3>
                            <p className="text-sm text-muted-foreground">{book.author}</p>
                            <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-gradient-primary"
                                style={{ width: `${progress.progress}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {progress.progress}%
                          </span>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings">
              <div className="glass-effect rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-6 flex items-center text-foreground">
                  <Settings className="h-5 w-5 mr-2 text-primary" />
                  Reading Preferences
                </h2>
                
                <div className="space-y-8">
                  {/* Font Size */}
                  <div>
                    <Label className="text-foreground mb-4 block">
                      Font Size: {preferences.fontSize}px
                    </Label>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setPreferences((prev) => ({
                            ...prev,
                            fontSize: Math.max(12, prev.fontSize - 2),
                          }))
                        }
                        className="border-border"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Slider
                        value={[preferences.fontSize]}
                        onValueChange={(value) =>
                          setPreferences((prev) => ({ ...prev, fontSize: value[0] }))
                        }
                        min={12}
                        max={24}
                        step={1}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setPreferences((prev) => ({
                            ...prev,
                            fontSize: Math.min(24, prev.fontSize + 2),
                          }))
                        }
                        className="border-border"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p
                      className="mt-4 p-4 rounded-lg bg-surface text-muted-foreground"
                      style={{ fontSize: `${preferences.fontSize}px` }}
                    >
                      Preview: The quick brown fox jumps over the lazy dog.
                    </p>
                  </div>

                  {/* Line Spacing */}
                  <div>
                    <Label className="text-foreground mb-4 block">
                      Line Spacing: {preferences.lineSpacing.toFixed(1)}
                    </Label>
                    <Slider
                      value={[preferences.lineSpacing]}
                      onValueChange={(value) =>
                        setPreferences((prev) => ({ ...prev, lineSpacing: value[0] }))
                      }
                      min={1}
                      max={2.5}
                      step={0.1}
                    />
                    <p
                      className="mt-4 p-4 rounded-lg bg-surface text-muted-foreground"
                      style={{
                        fontSize: `${preferences.fontSize}px`,
                        lineHeight: preferences.lineSpacing,
                      }}
                    >
                      Preview text with your chosen line spacing. This is how paragraphs
                      will appear when you're reading your favorite books.
                    </p>
                  </div>

                  {/* Theme */}
                  <div>
                    <Label className="text-foreground mb-4 block">App Theme</Label>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { value: "dark", label: "Dark", icon: Moon },
                        { value: "light", label: "Light", icon: Sun },
                      ].map((theme) => {
                        const Icon = theme.icon;
                        return (
                          <Button
                            key={theme.value}
                            variant="outline"
                            onClick={() => {
                              setTheme(theme.value as "dark" | "light");
                              setPreferences((prev) => ({
                                ...prev,
                                theme: theme.value as UserPreferences["theme"],
                              }));
                            }}
                            className={`capitalize h-auto py-4 flex-col gap-2 border-border ${
                              preferences.theme === theme.value
                                ? "border-primary bg-primary/10"
                                : ""
                            }`}
                          >
                            <Icon className="h-5 w-5" />
                            {theme.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Reading Level */}
                  <div>
                    <Label className="text-foreground mb-4 block">Reading Level</Label>
                    <Select
                      value={preferences.readingLevel}
                      onValueChange={(value) =>
                        setPreferences((prev) => ({
                          ...prev,
                          readingLevel: value as UserPreferences["readingLevel"],
                        }))
                      }
                    >
                      <SelectTrigger className="bg-surface border-border">
                        <SelectValue placeholder="Select reading level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">📖 Beginner (Ages 5-7)</SelectItem>
                        <SelectItem value="intermediate">📚 Intermediate (Ages 8-9)</SelectItem>
                        <SelectItem value="advanced">📕 Advanced (Ages 10-11)</SelectItem>
                        <SelectItem value="expert">🎓 Expert (Ages 12+)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Profile Tab */}
            <TabsContent value="profile">
              <div className="glass-effect rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-6 flex items-center text-foreground">
                  <User className="h-5 w-5 mr-2 text-primary" />
                  Profile Information
                </h2>
                
                <div className="space-y-6">
                  <div>
                    <Label className="text-foreground">Display Name</Label>
                    <Input
                      value={profile.name}
                      onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                      className="mt-2 bg-surface border-border"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-foreground">Bio</Label>
                    <Input
                      value={profile.bio}
                      onChange={(e) => setProfile((prev) => ({ ...prev, bio: e.target.value }))}
                      className="mt-2 bg-surface border-border"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-foreground">Avatar URL</Label>
                    <Input
                      value={profile.avatarUrl}
                      onChange={(e) => setProfile((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                      placeholder="https://example.com/avatar.jpg"
                      className="mt-2 bg-surface border-border"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Continue Reading CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <Button
              size="lg"
              onClick={() => navigate("/reading")}
              className="bg-gradient-primary hover:opacity-90 text-primary-foreground"
            >
              Continue Reading
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Profile;

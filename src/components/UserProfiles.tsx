import { useState } from "react";
import { UserIcon, LogIn } from "lucide-react";

interface BotProfile {
  id: string;
  name: string;
  color: string;
  online: boolean;
}

interface UserProfilesProps {
  className?: string;
  isConnected?: boolean;
}

const botProfiles: BotProfile[] = [
  { id: "1", name: "Alice", color: "#ef4444", online: true },
  { id: "2", name: "Bob", color: "#3b82f6", online: true },
  { id: "3", name: "Charlie", color: "#22c55e", online: false },
  { id: "4", name: "Diana", color: "#f59e0b", online: true },
  { id: "5", name: "Eve", color: "#a855f7", online: false },
];

export default function UserProfiles({
  className = "",
  isConnected = false,
}: UserProfilesProps) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userName, setUserName] = useState("");

  const handleSignIn = () => {
    if (!isSignedIn) {
      setUserName("User");
      setIsSignedIn(true);
    } else {
      setUserName("");
      setIsSignedIn(false);
    }
  };

  return (
    <div className={`flex items-center ${className}`}>
      {/* Users Stack - Glass morphism design */}
      <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 px-3 py-2">
        {/* Online count */}
        <div className="flex items-center gap-2 mr-3">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs text-gray-600 font-medium">
            {botProfiles.filter((bot) => bot.online).length} online
          </span>
        </div>

        {/* Avatar stack - only show online users */}
        <div className="flex items-center">
          {botProfiles
            .filter((bot) => bot.online)
            .slice(0, 4)
            .map((bot, index) => (
              <div
                key={bot.id}
                className="relative group"
                style={{
                  marginLeft: index > 0 ? "-8px" : "0",
                  zIndex: 10 - index,
                }}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-white shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:z-50 cursor-pointer"
                  style={{ backgroundColor: bot.color }}
                  title={`${bot.name} - Online`}
                >
                  {bot.name.charAt(0)}
                </div>
              </div>
            ))}

          {/* Additional online users indicator */}
          {botProfiles.filter((bot) => bot.online).length > 4 && (
            <div className="relative" style={{ marginLeft: "-8px", zIndex: 1 }}>
              <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors duration-200">
                <span className="text-xs text-gray-600 font-medium">
                  +{botProfiles.filter((bot) => bot.online).length - 4}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-8 bg-gray-200/50 mx-4"></div>

      {/* User Profile */}
      <div className="flex items-center">
        {/* Combined profile and name container */}
        <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 pl-1 pr-4 py-1">
          <div className="relative mr-3">
            {/* Main avatar with status ring */}
            <div
              className={`relative p-0.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"} transition-all duration-300`}
            >
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                {isSignedIn ? (
                  <span className="text-gray-700 font-bold text-sm">
                    {userName.charAt(0)}
                  </span>
                ) : (
                  <UserIcon className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Connection Status indicator */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
          </div>

          {/* User name or sign in */}
          <button
            onClick={handleSignIn}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors duration-200"
          >
            {isSignedIn ? (
              <span>{userName}</span>
            ) : (
              <div className="flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

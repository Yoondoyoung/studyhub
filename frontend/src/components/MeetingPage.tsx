import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ArrowLeft, Video, Loader2, AlertCircle } from "lucide-react";
import { apiBase } from "../utils/api";

interface MeetingInfo {
  meetingId: string;
  provider: string;
  zoomMeetingNumber: string;
  password: string;
  topic?: string;
}

interface MeetingPageProps {
  meetingId: string;
  accessToken: string | null;
  userName?: string;
  onBack: () => void;
}

export function MeetingPage({
  meetingId,
  accessToken,
  userName = "Guest",
  onBack,
}: MeetingPageProps) {
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [passcode, setPasscode] = useState("");
  const zoomRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/meetings/${meetingId}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setMeeting(data);
            setPasscode(data.password || "");
          }
        } else {
          if (!cancelled) setMeeting(null);
        }
      } catch {
        if (!cancelled) setMeeting(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  const handleJoin = async () => {
    if (!meeting || !zoomRootRef.current) return;
    setJoinError(null);
    setJoining(true);

    try {
      const jwtRes = await fetch(`${apiBase}/api/zoom/sdk-jwt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingNumber: meeting.zoomMeetingNumber,
          role: 0,
        }),
      });
      const jwtData = await jwtRes.json();
      if (!jwtRes.ok) {
        throw new Error(jwtData.error || "Failed to get meeting token");
      }
      const { signature, sdkKey, meetingNumber } = jwtData;

      const ZoomMtgEmbedded = (await import("@zoom/meetingsdk/embedded")).default;
      const client = ZoomMtgEmbedded.createClient();

      const initResult = await client.init({
        zoomAppRoot: zoomRootRef.current,
        language: "en-US",
        patchJsMedia: true,
        customize: {
          video: {
            defaultViewType: "speaker",
          },
        },
      });
      if (typeof initResult === "object" && "reason" in initResult) {
        throw new Error(initResult.reason || "Zoom init failed");
      }

      const joinResult = await client.join({
        signature,
        meetingNumber,
        password: passcode.trim() || "",
        userName,
      });
      if (typeof joinResult === "object" && joinResult !== null) {
        const fail = joinResult as { reason?: string; type?: string };
        if ("reason" in fail && fail.reason) {
          throw new Error(fail.reason);
        }
        if ("type" in fail) {
          throw new Error(fail.type || "Join failed");
        }
      }
      setJoining(false);
      setJoined(true);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "reason" in err
            ? String((err as { reason?: string }).reason)
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message?: string }).message)
              : String(err);
      setJoinError(msg || "Failed to join meeting");
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="size-10 animate-spin text-gray-400" />
        <p className="text-gray-500">Loading meeting...</p>
      </div>
    );
  }

  if (!meeting) {
    return (
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-amber-500" />
            Meeting not found
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            This meeting link is invalid or the meeting has been removed.
          </p>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="size-4 mr-2" />
            Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-2" />
          Leave
        </Button>
        <h1 className="text-lg font-semibold truncate max-w-[50%]">
          {meeting.topic || "Zoom Meeting"}
        </h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 min-h-0 rounded-xl overflow-auto border border-gray-200 bg-[#1a1a1a] flex flex-col">
        <div
          ref={zoomRootRef}
          className="flex-1 w-full min-h-[480px] h-full relative"
          style={{ minHeight: "60vh" }}
        />

        {!joined && !joining && !joinError && (
          <div className="p-4 border-t bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-center gap-4">
              <p className="text-sm text-gray-600">
                Meeting: <strong>{meeting.zoomMeetingNumber}</strong>
              </p>
              <Button onClick={handleJoin} disabled={joining}>
                <Video className="size-4 mr-2" />
                Join with Zoom
              </Button>
            </div>
            <div className="max-w-xs mx-auto space-y-1.5">
              <Label htmlFor="meeting-passcode" className="text-xs text-gray-500">
                Meeting passcode (if your Zoom meeting has one)
              </Label>
              <Input
                id="meeting-passcode"
                type="password"
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        )}

        {joining && (
          <div className="p-4 border-t bg-white flex items-center justify-center gap-2">
            <Loader2 className="size-5 animate-spin text-gray-500" />
            <span className="text-sm text-gray-600">Joining meeting...</span>
          </div>
        )}

        {joinError && (
          <div className="p-4 border-t bg-amber-50 space-y-3">
            <p className="text-sm text-amber-800 text-center">{joinError}</p>
            {(joinError.toLowerCase().includes("cross account") || joinError.toLowerCase().includes("external zoom account")) && (
              <div className="text-xs text-gray-600 text-center max-w-md mx-auto space-y-1">
                <p>To join meetings hosted by another Zoom account, your Meeting SDK app must be <strong>published on the Zoom Marketplace</strong>.</p>
                <p>See developers.zoom.us and Zoom API License Terms of Use (Section 6.1). Until then, create meetings with the same Zoom account that owns this SDK app.</p>
              </div>
            )}
            <div className="max-w-xs mx-auto space-y-1.5">
              <Label htmlFor="meeting-passcode-retry" className="text-xs text-gray-600">
                Meeting passcode (check Zoom invite if wrong)
              </Label>
              <Input
                id="meeting-passcode-retry"
                type="password"
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={handleJoin}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

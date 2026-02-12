import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ArrowLeft, Video, Loader2, AlertCircle, Mic, VideoOff } from "lucide-react";
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
  zoomContainerRef?: React.RefObject<HTMLDivElement | null>;
  onMeetingJoined?: (client: unknown) => void;
}

export function MeetingPage({
  meetingId,
  accessToken,
  userName = "Guest",
  onBack,
  zoomContainerRef: externalZoomRootRef,
  onMeetingJoined,
}: MeetingPageProps) {
  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] });
  const [videoId, setVideoId] = useState<string>("");
  const [audioId, setAudioId] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const zoomRootRef = useRef<HTMLDivElement>(null);
  const zoomClientRef = useRef<ReturnType<typeof import("@zoom/meetingsdk/embedded").default.createClient> | null>(null);

  const leaveMeetingAndBack = async () => {
    try {
      const client = zoomClientRef.current;
      if (client && typeof client.leaveMeeting === "function") {
        const leave = client.leaveMeeting as (opts?: { confirm?: boolean }) => Promise<unknown>;
        await leave.call(client, { confirm: false });
      }
      const ZoomMtgEmbedded = (await import("@zoom/meetingsdk/embedded")).default;
      ZoomMtgEmbedded.destroyClient?.();
    } catch {
      // ignore
    } finally {
      zoomClientRef.current = null;
      onBack();
    }
  };

  useEffect(() => {
    return () => {
      if (externalZoomRootRef) {
        // Meeting is in App's floating container – do not leave/destroy on unmount
        zoomClientRef.current = null;
      } else {
        const client = zoomClientRef.current;
        if (client && typeof client.leaveMeeting === "function") {
          client.leaveMeeting().catch(() => {});
        }
        zoomClientRef.current = null;
      }
      previewStream?.getTracks().forEach((t) => t.stop());
    };
  }, [externalZoomRootRef]);

  useEffect(() => {
    if (!meeting) return;
    let stream: MediaStream | null = null;
    const startPreview = async () => {
      try {
        setPreviewError(null);
        const constraints: MediaStreamConstraints = {
          video: videoId ? { deviceId: { exact: videoId } } : true,
          audio: audioId ? { deviceId: { exact: audioId } } : true,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        setPreviewStream(stream);
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices({
          cameras: devs.filter((d) => d.kind === "videoinput"),
          mics: devs.filter((d) => d.kind === "audioinput"),
        });
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : "Could not access camera/microphone");
      }
    };
    startPreview();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [meeting?.meetingId, videoId, audioId]);

  useEffect(() => {
    if (!previewStream || !previewVideoRef.current) return;
    previewVideoRef.current.srcObject = previewStream;
  }, [previewStream]);

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
    const zoomRoot = externalZoomRootRef?.current ?? zoomRootRef.current;
    if (!meeting || !zoomRoot) return;
    setJoinError(null);
    previewStream?.getTracks().forEach((t) => t.stop());
    setPreviewStream(null);
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
      ZoomMtgEmbedded.destroyClient?.();
      const client = ZoomMtgEmbedded.createClient();
      zoomClientRef.current = client;

      const initResult = await client.init({
        zoomAppRoot: zoomRoot,
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
      onMeetingJoined?.(client);
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
        <Button variant="ghost" size="sm" onClick={leaveMeetingAndBack}>
          <ArrowLeft className="size-4 mr-2" />
          Leave
        </Button>
        <h1 className="text-lg font-semibold truncate max-w-[50%]">
          {meeting.topic || "Zoom Meeting"}
        </h1>
        <div className="w-20" />
      </div>

      <div className="flex-1 min-h-0 rounded-xl overflow-auto border border-gray-200 bg-[#1a1a1a] flex flex-col relative">
        <div
          ref={zoomRootRef}
          className={`flex-1 w-full min-h-[480px] h-full relative ${externalZoomRootRef && joined ? "hidden" : ""}`}
          style={{ minHeight: "60vh" }}
        />
        {externalZoomRootRef && joined && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-white/70 text-sm text-center">
            <p>Meeting is in the floating window. You can go to other pages and keep the call.</p>
            <Button variant="outline" size="sm" onClick={leaveMeetingAndBack} className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300">
              Leave
            </Button>
          </div>
        )}
        {!joined && !joining && !joinError && (
          <div className="absolute inset-0 z-10 flex flex-col bg-[#1a1a1a] p-4">
            <p className="text-sm text-white/80 text-center mb-2">Check your camera and microphone before joining</p>
            <div className="flex-1 min-h-[200px] rounded-lg overflow-hidden bg-black flex items-center justify-center">
              {previewError ? (
                <div className="text-center p-4 text-white/90">
                  <VideoOff className="size-12 mx-auto mb-2 opacity-70" />
                  <p className="text-sm">{previewError}</p>
                  <p className="text-xs text-white/60 mt-1">Allow camera/mic in browser settings and refresh.</p>
                </div>
              ) : (
                <video
                  ref={previewVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {devices.cameras.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/80 flex items-center gap-1.5">
                    <Video className="size-3.5" />
                    Camera
                  </Label>
                  <Select value={videoId || devices.cameras[0]?.deviceId} onValueChange={setVideoId}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white">
                      <SelectValue placeholder="Camera" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.cameras.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${devices.cameras.indexOf(d) + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {devices.mics.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-white/80 flex items-center gap-1.5">
                    <Mic className="size-3.5" />
                    Microphone
                  </Label>
                  <Select value={audioId || devices.mics[0]?.deviceId} onValueChange={setAudioId}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white">
                      <SelectValue placeholder="Microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.mics.map((d) => (
                        <SelectItem key={d.deviceId} value={d.deviceId}>
                          {d.label || `Mic ${devices.mics.indexOf(d) + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <p className="text-sm text-white/80">
                  Meeting: <strong className="text-white">{meeting.zoomMeetingNumber}</strong>
                </p>
                <Button onClick={handleJoin} disabled={joining} className="bg-blue-600 hover:bg-blue-700">
                  <Video className="size-4 mr-2" />
                  Join with Zoom
                </Button>
              </div>
              <div className="max-w-xs mx-auto space-y-1.5">
                <Label htmlFor="meeting-passcode" className="text-xs text-white/60">
                  Meeting passcode (if required)
                </Label>
                <Input
                  id="meeting-passcode"
                  type="password"
                  placeholder="Enter passcode"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
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
            {joinError.toLowerCase().includes("already has other meetings") && (
              <p className="text-xs text-gray-600 text-center max-w-md mx-auto">
                Close other Zoom meeting tabs or windows, then click Leave on this page and try again in a few seconds.
              </p>
            )}
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

import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft } from 'lucide-react';

interface StudyRoomPageProps {
  groupId: string;
  onBack: () => void;
}

export function StudyRoomPage({ groupId, onBack }: StudyRoomPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Back to Study Groups
        </Button>
      </div>
      <Card className="border-2">
        <CardHeader>
          <CardTitle>Study Room</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Room ID: <code className="text-sm bg-gray-100 px-1 rounded">{groupId}</code>
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            (Placeholder — meeting screen to be added)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

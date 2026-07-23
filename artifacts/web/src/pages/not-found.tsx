import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 flex flex-col items-center text-center space-y-4">
          <AlertCircle className="h-16 w-16 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">Page Not Found</h1>
          <p className="text-muted-foreground">
            The page you are looking for does not exist or has been moved.
          </p>
          <Link href="/dashboard" className="text-primary hover:underline font-medium">
            Return to Dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

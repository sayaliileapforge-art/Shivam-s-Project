import { Factory, CheckCircle, Clock, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";

const productionJobs: { id: string; project: string; client: string; status: string; progress: number }[] = [];

export function Production() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Production Management</h1>
        <p className="text-muted-foreground mt-1">Monitor and manage production pipeline</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "In Production", count: 0, icon: Factory, color: "text-secondary" },
          { label: "Queued", count: 0, icon: Clock, color: "text-warning" },
          { label: "Completed", count: 0, icon: CheckCircle, color: "text-success" },
          { label: "Dispatched", count: 0, icon: Truck, color: "text-info" },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="shadow-md">
              <CardContent className="p-6">
                <Icon className={`h-5 w-5 ${stat.color} mb-2`} />
                <p className="text-2xl font-bold">{stat.count}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Production Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {productionJobs.map((job) => (
              <div key={job.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">{job.project}</p>
                    <p className="text-sm text-muted-foreground">{job.client} • {job.id}</p>
                  </div>
                  <Badge variant={job.status === "completed" ? "default" : "secondary"}>
                    {job.status}
                  </Badge>
                </div>
                <Progress value={job.progress} />
                <p className="text-xs text-muted-foreground mt-2">{job.progress}% Complete</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

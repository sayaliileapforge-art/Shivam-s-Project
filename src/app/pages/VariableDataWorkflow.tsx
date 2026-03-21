import React, { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
  Clock,
  ArrowRight,
  Filter,
} from "lucide-react";
import { useRbac } from "../../lib/rbac/RbacContext";
import {
  VariableDataStatus,
  WorkflowType,
  PAYMENT_PHASES,
} from "../../lib/workflowConstants";
import {
  canTransitionStatus,
  getWorkflowProgress,
  getNextPendingSteps,
  canProceedToPrinting,
  isWorkflowComplete,
} from "../../lib/workflowUtils";
import {
  loadWorkflowProjects,
  getWorkflowProjectsByOwner,
  updateWorkflowStatus,
  getWorkflowProject,
} from "../../lib/projectStore";
import WorkflowStepper from "../components/workflow/WorkflowStepper";
import StatusBadge from "../components/workflow/StatusBadge";
import WorkflowTimeline from "../components/workflow/WorkflowTimeline";
import StatusTransitionModal from "../components/workflow/StatusTransitionModal";

export const VariableDataWorkflow = () => {
  const { user } = useRbac();
  const [projects, setProjects] = useState(loadWorkflowProjects());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [statusTransitionError, setStatusTransitionError] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const isAdmin =
    user?.role === "super_admin" ||
    user?.role === "master_vendor" ||
    user?.role === "accounts_manager";

  // Get variable data projects only
  const variableDataProjects = useMemo(() => {
    return projects.filter(
      (p) =>
        p.workflowType === WorkflowType.VARIABLE_DATA &&
        (isAdmin || p.ownerId === user?.id)
    );
  }, [projects, isAdmin, user?.id]);

  // Filter projects by status if filter is applied
  const filteredProjects = filterStatus
    ? variableDataProjects.filter((p) => p.workflowData.currentStatus === filterStatus)
    : variableDataProjects;

  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null;

  const handleStatusUpdate = (newStatus: string, reason?: string) => {
    if (!selectedProject || !user?.id) return;

    const validation = canTransitionStatus(
      selectedProject.workflowData.currentStatus,
      newStatus,
      WorkflowType.VARIABLE_DATA
    );

    if (!validation.allowed) {
      setStatusTransitionError(validation.reason || "Invalid status transition");
      return;
    }

    updateWorkflowStatus(selectedProject.id, newStatus, user.id, reason);
    setProjects(loadWorkflowProjects());
    setShowTransitionModal(false);
    setStatusTransitionError("");
  };

  const getAvailableNextStatuses = (currentStatus: string) => {
    const allStatuses = Object.values(VariableDataStatus);
    return allStatuses.filter((status) => {
      const validation = canTransitionStatus(
        currentStatus,
        status,
        WorkflowType.VARIABLE_DATA
      );
      return validation.allowed;
    });
  };

  const progressPercentage = selectedProject
    ? getWorkflowProgress(
        selectedProject.workflowData.currentStatus,
        WorkflowType.VARIABLE_DATA
      )
    : 0;

  // Summary stats
  const statsData = {
    totalProjects: variableDataProjects.length,
    inProgress: variableDataProjects.filter(
      (p) => !isWorkflowComplete(p.workflowData.currentStatus, WorkflowType.VARIABLE_DATA)
    ).length,
    completed: variableDataProjects.filter((p) =>
      isWorkflowComplete(p.workflowData.currentStatus, WorkflowType.VARIABLE_DATA)
    ).length,
    awaitingPayment: variableDataProjects.filter(
      (p) =>
        p.workflowData.currentStatus ===
        VariableDataStatus.AWAITING_REMAINING_PAYMENT
    ).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Variable Data Printing Workflow</h1>
        <p className="text-muted-foreground mt-2">
          Manage variable data printing projects with step-by-step workflow progression
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsData.totalProjects}</p>
            <p className="text-xs text-muted-foreground mt-1">All variable data projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsData.inProgress}</p>
            <p className="text-xs text-muted-foreground mt-1">Incomplete projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsData.completed}</p>
            <p className="text-xs text-muted-foreground mt-1">Delivered projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Awaiting Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">
              {statsData.awaitingPayment}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Remaining 50%</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">Projects List</TabsTrigger>
          {selectedProject && <TabsTrigger value="details">Project Details</TabsTrigger>}
        </TabsList>

        {/* Projects List Tab */}
        <TabsContent value="list" className="space-y-4">
          {/* Filter */}
          <div className="flex gap-2 items-center flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Button
              variant={filterStatus === null ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStatus(null)}
            >
              All
            </Button>
            {(Object.values(VariableDataStatus) as string[]).map((status) => (
              <Button
                key={status}
                variant={filterStatus === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(status)}
              >
                {status}
              </Button>
            ))}
          </div>

          {/* Projects List */}
          <div className="space-y-3">
            {filteredProjects.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No variable data projects found</p>
              </Card>
            ) : (
              filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className={`p-4 cursor-pointer transition-all ${
                    selectedProject?.id === project.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/30"
                  }`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                    {/* Project Info */}
                    <div>
                      <p className="font-semibold">{project.name}</p>
                      <p className="text-sm text-muted-foreground">{project.clientName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {project.id}
                      </p>
                    </div>

                    {/* Status */}
                    <div>
                      <StatusBadge
                        status={project.workflowData.currentStatus}
                        size="sm"
                      />
                    </div>

                    {/* Progress */}
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all"
                              style={{
                                width: `${getWorkflowProgress(
                                  project.workflowData.currentStatus,
                                  WorkflowType.VARIABLE_DATA
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          {getWorkflowProgress(
                            project.workflowData.currentStatus,
                            WorkflowType.VARIABLE_DATA
                          )}
                          %
                        </span>
                      </div>
                    </div>

                    {/* Created Date */}
                    <div className="text-sm text-muted-foreground text-right">
                      {new Date(
                        project.workflowData.createdAt
                      ).toLocaleDateString()}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Project Details Tab */}
        {selectedProject && (
          <TabsContent value="details" className="space-y-6">
            {/* Project Header */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedProject.name}</CardTitle>
                    <CardDescription>{selectedProject.clientName}</CardDescription>
                  </div>
                  <StatusBadge
                    status={selectedProject.workflowData.currentStatus}
                    size="md"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Project ID</p>
                    <p className="font-semibold">{selectedProject.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Client</p>
                    <p className="font-semibold">{selectedProject.clientId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Owner</p>
                    <p className="font-semibold">{selectedProject.ownerName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-semibold">
                      {new Date(
                        selectedProject.workflowData.createdAt
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Progress Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Workflow Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold">
                      {progressPercentage}% Complete
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(progressPercentage / 7)} of 13 steps
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-primary h-3 rounded-full transition-all"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Stepper */}
                <div className="mt-6">
                  <WorkflowStepper
                    currentStatus={selectedProject.workflowData.currentStatus}
                    workflowType={WorkflowType.VARIABLE_DATA}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Status */}
            {(selectedProject.workflowData.currentStatus ===
              VariableDataStatus.PROOF_CONFIRMED ||
              selectedProject.workflowData.currentStatus ===
                VariableDataStatus.AWAITING_REMAINING_PAYMENT) && (
              <Card className="border-amber-200 bg-amber-50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Payment Required
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-2xl font-bold">
                        ₹{selectedProject.payment?.totalAmount || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Advance Payment (50%)
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        ₹{selectedProject.payment?.advanceAmount || 0}
                      </p>
                      {selectedProject.payment?.advancePaymentDate && (
                        <p className="text-xs text-green-600">
                          Received:{" "}
                          {new Date(
                            selectedProject.payment.advancePaymentDate
                          ).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {selectedProject.workflowData.currentStatus ===
                      VariableDataStatus.AWAITING_REMAINING_PAYMENT && (
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Remaining (50%)
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          ₹{selectedProject.payment?.remainingAmount || 0}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Status Update Section */}
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Update Status</CardTitle>
                  <CardDescription>
                    Move to the next step in the workflow
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {statusTransitionError && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{statusTransitionError}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    onClick={() => setShowTransitionModal(true)}
                    disabled={isWorkflowComplete(
                      selectedProject.workflowData.currentStatus,
                      WorkflowType.VARIABLE_DATA
                    )}
                    className="w-full"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Update Workflow Status
                  </Button>

                  {isWorkflowComplete(
                    selectedProject.workflowData.currentStatus,
                    WorkflowType.VARIABLE_DATA
                  ) && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>Workflow Completed</AlertTitle>
                      <AlertDescription>
                        This workflow has been completed and delivered.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Status History</CardTitle>
                <CardDescription>Timeline of workflow status changes</CardDescription>
              </CardHeader>
              <CardContent>
                <WorkflowTimeline history={selectedProject.workflowData.statusHistory} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Status Transition Modal */}
      {selectedProject && (
        <StatusTransitionModal
          isOpen={showTransitionModal}
          onClose={() => {
            setShowTransitionModal(false);
            setStatusTransitionError("");
          }}
          onConfirm={handleStatusUpdate}
          currentStatus={selectedProject.workflowData.currentStatus}
          availableNextStatuses={getAvailableNextStatuses(
            selectedProject.workflowData.currentStatus
          )}
          workflowData={selectedProject.workflowData}
        />
      )}
    </div>
  );
};

export default VariableDataWorkflow;

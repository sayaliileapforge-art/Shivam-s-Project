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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  FileUp,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Filter,
  FileCheck,
} from "lucide-react";
import { useRbac } from "../../lib/rbac/RbacContext";
import {
  DirectPrintStatus,
  WorkflowType,
  STATUS_LABELS,
} from "../../lib/workflowConstants";
import {
  canTransitionStatus,
  getWorkflowProgress,
  isWorkflowComplete,
} from "../../lib/workflowUtils";
import {
  loadWorkflowProjects,
  updateWorkflowStatus,
} from "../../lib/projectStore";
import WorkflowStepper from "../components/workflow/WorkflowStepper";
import StatusBadge from "../components/workflow/StatusBadge";
import WorkflowTimeline from "../components/workflow/WorkflowTimeline";
import StatusTransitionModal from "../components/workflow/StatusTransitionModal";

export const DirectPrintWorkflow = () => {
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

  // Get direct print projects only
  const directPrintProjects = useMemo(() => {
    return projects.filter(
      (p) =>
        p.workflowType === WorkflowType.DIRECT_PRINT &&
        (isAdmin || p.ownerId === user?.id)
    );
  }, [projects, isAdmin, user?.id]);

  // Filter projects by status if filter is applied
  const filteredProjects = filterStatus
    ? directPrintProjects.filter((p) => p.workflowData.currentStatus === filterStatus)
    : directPrintProjects;

  const selectedProject = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)
    : null;

  const handleStatusUpdate = (newStatus: string, reason?: string) => {
    if (!selectedProject || !user?.id) return;

    const validation = canTransitionStatus(
      selectedProject.workflowData.currentStatus,
      newStatus,
      WorkflowType.DIRECT_PRINT
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
    const allStatuses = Object.values(DirectPrintStatus);
    return allStatuses.filter((status) => {
      const validation = canTransitionStatus(
        currentStatus,
        status,
        WorkflowType.DIRECT_PRINT
      );
      return validation.allowed;
    });
  };

  const progressPercentage = selectedProject
    ? getWorkflowProgress(
        selectedProject.workflowData.currentStatus,
        WorkflowType.DIRECT_PRINT
      )
    : 0;

  // Summary stats
  const statsData = {
    totalProjects: directPrintProjects.length,
    pendingPayment: directPrintProjects.filter(
      (p) => p.workflowData.currentStatus === DirectPrintStatus.FILE_RECEIVED
    ).length,
    inPrinting: directPrintProjects.filter(
      (p) => p.workflowData.currentStatus === DirectPrintStatus.PRINTING ||
             p.workflowData.currentStatus === DirectPrintStatus.AWAITING_REMAINING_PAYMENT
    ).length,
    completed: directPrintProjects.filter((p) =>
      isWorkflowComplete(p.workflowData.currentStatus, WorkflowType.DIRECT_PRINT)
    ).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Direct Print Orders</h1>
        <p className="text-muted-foreground mt-2">
          Upload PDF files and manage direct printing orders with simplified workflow
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsData.totalProjects}</p>
            <p className="text-xs text-muted-foreground mt-1">All direct print orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-600">{statsData.pendingPayment}</p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Printing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{statsData.inPrinting}</p>
            <p className="text-xs text-muted-foreground mt-1">Actively printing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{statsData.completed}</p>
            <p className="text-xs text-muted-foreground mt-1">Delivered orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">Orders List</TabsTrigger>
          {selectedProject && <TabsTrigger value="details">Order Details</TabsTrigger>}
        </TabsList>

        {/* Orders List Tab */}
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
            {(Object.values(DirectPrintStatus) as string[]).map((status) => (
              <Button
                key={status}
                variant={filterStatus === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterStatus(status)}
              >
                {STATUS_LABELS[status]}
              </Button>
            ))}
          </div>

          {/* Orders List */}
          <div className="space-y-3">
            {filteredProjects.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No direct print orders found</p>
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
                    {/* Order Info */}
                    <div>
                      <p className="font-semibold flex items-center gap-2">
                        <FileCheck className="w-4 h-4" />
                        {project.name}
                      </p>
                      <p className="text-sm text-muted-foreground">{project.clientName}</p>
                      <p className="text-xs text-muted-foreground mt-1">{project.id}</p>
                    </div>

                    {/* File Info */}
                    {project.fileData && (
                      <div>
                        <p className="text-sm text-muted-foreground">File</p>
                        <p className="font-semibold text-sm">{project.fileData.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {(project.fileData.fileSize / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    )}

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
                                  WorkflowType.DIRECT_PRINT
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
                          {getWorkflowProgress(
                            project.workflowData.currentStatus,
                            WorkflowType.DIRECT_PRINT
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* Order Details Tab */}
        {selectedProject && (
          <TabsContent value="details" className="space-y-6">
            {/* Order Header */}
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
                    <p className="text-muted-foreground">Order ID</p>
                    <p className="font-semibold">{selectedProject.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Client</p>
                    <p className="font-semibold">{selectedProject.clientId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-semibold">
                      {new Date(
                        selectedProject.workflowData.createdAt
                      ).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p className="font-semibold">
                      {new Date(
                        selectedProject.workflowData.updatedAt
                      ).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* File Details */}
            {selectedProject.fileData && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileUp className="w-5 h-5" />
                    Uploaded File
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">File Name</p>
                      <p className="font-semibold">
                        {selectedProject.fileData.fileName}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">File Type</p>
                      <p className="font-semibold">
                        {selectedProject.fileData.fileType}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">File Size</p>
                      <p className="font-semibold">
                        {(
                          selectedProject.fileData.fileSize /
                          1024 /
                          1024
                        ).toFixed(2)}{" "}
                        MB
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Uploaded On</p>
                      <p className="font-semibold">
                        {new Date(
                          selectedProject.fileData.uploadedAt
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Progress Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Order Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold">
                      {progressPercentage}% Complete
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(progressPercentage / 14)} of 7 steps
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
                    workflowType={WorkflowType.DIRECT_PRINT}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Status */}
            {selectedProject.payment && (
              <Card
                className={
                  selectedProject.workflowData.currentStatus ===
                  DirectPrintStatus.AWAITING_REMAINING_PAYMENT
                    ? "border-amber-200 bg-amber-50"
                    : ""
                }
              >
                <CardHeader>
                  <CardTitle className="text-sm">Payment Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-2xl font-bold">
                        ₹{selectedProject.payment.totalAmount}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Amount Received
                      </p>
                      <p className="text-2xl font-bold text-primary">
                        ₹
                        {selectedProject.payment.advanceAmount +
                          (selectedProject.payment.remainingPaymentDate
                            ? selectedProject.payment.remainingAmount
                            : 0)}
                      </p>
                    </div>
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
                      WorkflowType.DIRECT_PRINT
                    )}
                    className="w-full"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Update Order Status
                  </Button>

                  {isWorkflowComplete(
                    selectedProject.workflowData.currentStatus,
                    WorkflowType.DIRECT_PRINT
                  ) && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertTitle>Order Completed</AlertTitle>
                      <AlertDescription>
                        This order has been completed and delivered.
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
                <CardDescription>Timeline of order status changes</CardDescription>
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

export default DirectPrintWorkflow;

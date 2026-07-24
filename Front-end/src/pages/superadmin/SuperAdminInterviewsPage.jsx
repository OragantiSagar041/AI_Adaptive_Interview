import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { loadSuperAdminDashboard } from "../../store/slices/dashboardSlice";
import { CandidateTable, CandidateFilters } from "../../components/admin/AdminSubComponents";
import CandidateDialog from "../../components/superadmin/CandidateDialog";
import CallDetailsModal from "../admin/CallDetailsModal";
import { getComputedStatus } from "../../utils/adminFormatters";
import {
  setSelectedIds,
  setCurrentPage,
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setAdminFilter,
  setPipelineFilter,
  setPositionFilter,
  handleSuperAdminBulkDelete,
  handleSuperAdminExportExcel
} from "../../store/slices/candidatesSlice";
import { handleDeleteSession } from "../../store/slices/interviewSlice";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SuperAdminInterviewsPage() {
  const dispatch = useDispatch();
  const { API_BASE_URL, token } = useSelector((state) => state.auth);
  
  const selectedAdminFilter = useSelector((state) => state.dashboard.selectedAdminFilter);
  const paginatedCandidates = useSelector((state) => state.candidates.paginatedCandidates);
  const selectedIds = useSelector((state) => state.candidates.selectedIds);
  const totalPages = useSelector((state) => state.candidates.totalPages);
  const startIndex = useSelector((state) => state.candidates.startIndex);
  const endIndex = useSelector((state) => state.candidates.endIndex);
  const totalItems = useSelector((state) => state.candidates.totalItems);
  const currentPage = useSelector((state) => state.candidates.currentPage);

  const searchTerm = useSelector((state) => state.candidates.searchTerm);
  const startDate = useSelector((state) => state.candidates.startDate);
  const endDate = useSelector((state) => state.candidates.endDate);
  const statusFilter = useSelector((state) => state.candidates.statusFilter);
  const adminFilter = useSelector((state) => state.candidates.adminFilter);
  const pipelineFilter = useSelector((state) => state.candidates.pipelineFilter);
  const positionFilter = useSelector((state) => state.candidates.positionFilter);
  const sortBy = useSelector((state) => state.candidates.sortBy);
  const allCandidates = useSelector((state) => state.candidates.candidates);

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [adminsList, setAdminsList] = useState([]);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/super-admin/admins`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json && json.data) {
          setAdminsList(json.data);
        }
      } catch (e) {
        console.error("Failed to fetch admins:", e);
      }
    };
    if (token) {
      fetchAdmins();
    }
  }, [token, API_BASE_URL]);

  useEffect(() => {
    dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter }));
  }, [dispatch, selectedAdminFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Interviews</h1>
        <p className="text-sm text-slate-500">
          View all AI interviews and manage candidates.
        </p>
      </div>
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All Candidates</CardTitle>
          <CardDescription>Comprehensive list of evaluated candidates.</CardDescription>
        </CardHeader>
        <CardContent>
          <CandidateFilters
            searchTerm={searchTerm}
            setSearchTerm={(val) => dispatch(setSearchTerm(val))}
            startDate={startDate}
            setStartDate={(val) => dispatch(setStartDate(val))}
            endDate={endDate}
            setEndDate={(val) => dispatch(setEndDate(val))}
            statusFilter={statusFilter}
            setStatusFilter={(val) => dispatch(setStatusFilter(val))}
            adminFilter={adminFilter}
            setAdminFilter={(val) => dispatch(setAdminFilter(val))}
            pipelineFilter={pipelineFilter}
            setPipelineFilter={(val) => dispatch(setPipelineFilter(val))}
            positionFilter={positionFilter}
            setPositionFilter={(val) => dispatch(setPositionFilter(val))}
            sortBy={sortBy}
            setSortBy={(val) => dispatch(setSortBy(val))}
            handleExportExcel={() => dispatch(handleSuperAdminExportExcel(paginatedCandidates))}
            selectedIds={selectedIds}
            handleBulkDelete={() => dispatch(handleSuperAdminBulkDelete(selectedIds))}
            allCandidates={allCandidates}
            adminsList={adminsList}
          />
          <CandidateTable
            paginatedCandidates={paginatedCandidates}
            selectedIds={selectedIds}
            setSelectedIds={(ids) => dispatch(setSelectedIds(ids))}
            getComputedStatus={getComputedStatus}
            handleOpenScorecard={(c) => setSelectedCandidate(c)}
            handleDeleteSession={(id) => {
              if (
                !confirm(
                  "Are you sure you want to delete this candidate's interview session? This cannot be undone."
                )
              )
                return;
              dispatch(handleDeleteSession(id));
            }}
            loadDashboardData={() => dispatch(loadSuperAdminDashboard(selectedAdminFilter))}
            API_BASE_URL={API_BASE_URL}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={totalItems}
            currentPage={currentPage}
            setCurrentPage={(page) => dispatch(setCurrentPage(page))}
          />
        </CardContent>
      </Card>

      {selectedCandidate?.id?.startsWith("ai_call_omni_") ? (
        <CallDetailsModal
          isOpen={!!selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          callId={selectedCandidate.id.replace("ai_call_omni_", "")}
          API_BASE_URL={API_BASE_URL}
          token={token}
        />
      ) : (
        <CandidateDialog
          candidate={selectedCandidate}
          open={!!selectedCandidate}
          onOpenChange={(v) => {
            if (!v) setSelectedCandidate(null);
          }}
          onStatusUpdate={() => {
            dispatch(loadSuperAdminDashboard(selectedAdminFilter));
          }}
        />
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { targetAPI, userAPI } from '../services/api';
import { Plus, Edit2, Trash2, Save, X, Target, Calendar, CheckCircle, XCircle, Clock, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

function TargetEntry() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'active', 'completed', 'cancelled'
  const [formData, setFormData] = useState({
    date_of_target: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0],
    target_weight: ''
  });

  const queryClient = useQueryClient();

  // Fetch current weight for context
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const response = await userAPI.getStats();
      return response.data;
    },
  });

  // Fetch targets
  const { data: targets, isLoading } = useQuery({
    queryKey: ['targets', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'all' ? { status_filter: statusFilter } : {};
      const response = await targetAPI.list(params);
      return response.data;
    },
  });

  // Add target mutation
  const addMutation = useMutation({
    mutationFn: (data) => targetAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['targets']);
      queryClient.invalidateQueries(['dashboard']);
      setIsAdding(false);
      resetForm();
    },
  });

  // Update target mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => targetAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['targets']);
      queryClient.invalidateQueries(['dashboard']);
      setEditingId(null);
      resetForm();
    },
  });

  // Delete target mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => targetAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['targets']);
      queryClient.invalidateQueries(['dashboard']);
    },
  });

  // Complete target mutation
  const completeMutation = useMutation({
    mutationFn: (id) => targetAPI.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['targets']);
      queryClient.invalidateQueries(['dashboard']);
    },
  });

  // Cancel target mutation
  const cancelMutation = useMutation({
    mutationFn: (id) => targetAPI.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['targets']);
      queryClient.invalidateQueries(['dashboard']);
    },
  });

  const resetForm = () => {
    setFormData({
      date_of_target: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split('T')[0],
      target_weight: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const submitData = {
      date_of_target: formData.date_of_target,
      target_weight: parseFloat(formData.target_weight)
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      addMutation.mutate(submitData);
    }
  };

  const handleEdit = (target) => {
    setEditingId(target.id);
    setFormData({
      date_of_target: target.date_of_target,
      target_weight: target.target_weight.toString()
    });
    setIsAdding(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this target goal?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleComplete = (id) => {
    if (window.confirm('Mark this goal as completed?')) {
      completeMutation.mutate(id);
    }
  };

  const handleCancel = (id) => {
    if (window.confirm('Cancel this goal?')) {
      cancelMutation.mutate(id);
    }
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'active': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'active': return <Clock className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'failed':
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  const currentWeight = stats?.current_weight || 0;
  const weightDifference = formData.target_weight ? (parseFloat(formData.target_weight) - currentWeight).toFixed(1) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading targets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Target Goals</h1>
          <p className="text-gray-600 mt-1">Set and track your weight loss goals</p>
          {stats?.current_weight && (
            <p className="text-sm text-gray-500 mt-2">
              Current weight: <span className="font-semibold">{stats.current_weight} kg</span>
            </p>
          )}
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            New Goal
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="card max-w-2xl bg-gradient-to-br from-blue-50 to-blue-100">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold text-gray-800">
              {editingId ? 'Edit Goal' : 'New Goal'}
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Target Weight */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Weight (kg) *
              </label>
              <input
                type="number"
                step="0.1"
                required
                value={formData.target_weight}
                onChange={(e) => setFormData({ ...formData, target_weight: e.target.value })}
                className="input"
                placeholder="90.0"
                min="30"
                max="300"
              />
              {weightDifference && (
                <p className={`text-sm mt-2 flex items-center gap-1 ${
                  parseFloat(weightDifference) < 0 ? 'text-green-600' : 'text-orange-600'
                }`}>
                  <TrendingDown className="w-4 h-4" />
                  {parseFloat(weightDifference) < 0 ? 
                    `${Math.abs(weightDifference)} kg to lose` : 
                    `${weightDifference} kg above current weight`
                  }
                </p>
              )}
            </div>

            {/* Target Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Date *
              </label>
              <input
                type="date"
                required
                value={formData.date_of_target}
                onChange={(e) => setFormData({ ...formData, date_of_target: e.target.value })}
                className="input"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="btn btn-primary flex items-center gap-2"
                disabled={addMutation.isPending || updateMutation.isPending}
              >
                <Save size={18} />
                {addMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Goal'}
              </button>
              <button
                type="button"
                onClick={handleCancelForm}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>

            {(addMutation.isError || updateMutation.isError) && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                Error: {addMutation.error?.response?.data?.detail || updateMutation.error?.response?.data?.detail || 'Failed to save goal'}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {['all', 'active', 'completed', 'failed', 'cancelled'].map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`px-4 py-2 font-medium text-sm capitalize transition-colors ${
              statusFilter === filter
                ? 'border-b-2 border-primary-600 text-primary-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Target List */}
      {targets && targets.length === 0 ? (
        <div className="card text-center py-12">
          <Target className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            {statusFilter === 'all' ? 'No goals yet' : `No ${statusFilter} goals`}
          </h3>
          <p className="text-gray-600 mb-4">
            Start your weight loss journey by setting your first goal
          </p>
          {!isAdding && statusFilter === 'all' && (
            <button
              onClick={() => setIsAdding(true)}
              className="btn btn-primary mx-auto flex items-center gap-2"
            >
              <Plus size={20} />
              Create Your First Goal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {targets.map((target) => {
            const statusLc = (target.status || '').toLowerCase();
            const isActive = statusLc === 'active';
            const isCompleted = statusLc === 'completed';
            const isCancelled = statusLc === 'failed' || statusLc === 'cancelled';
            const isPast = new Date(target.date_of_target) < new Date();
            // Prefer server-enriched values when available
            const finalWeightVal = (target.final_weight !== undefined && target.final_weight !== null)
              ? parseFloat(target.final_weight)
              : (stats?.current_weight ? parseFloat(stats.current_weight) : null);
            // Server provides weight_to_lose as (current - target)
            const weightToLoseNum = (target.weight_to_lose !== undefined && target.weight_to_lose !== null)
              ? parseFloat(target.weight_to_lose)
              : (finalWeightVal !== null ? (finalWeightVal - parseFloat(target.target_weight)) : null);
            // Determine label for third column: show "Current" for active targets until the day AFTER target date
            const targetDateObj = new Date(target.date_of_target);
            const finalThreshold = new Date(targetDateObj);
            finalThreshold.setDate(finalThreshold.getDate() + 1);
            const showFinal = new Date() >= finalThreshold;
            const thirdLabel = (isActive && !showFinal) ? 'Current' : 'Final';

            return (
              <div
                key={target.id}
                className={`card ${
                  isActive ? 'border-2 border-primary-200 bg-gradient-to-br from-white to-blue-50' :
                  isCompleted ? 'border-2 border-green-200 bg-gradient-to-br from-white to-green-50' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className={`w-6 h-6 ${isActive ? 'text-primary-600' : isCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                      <h3 className="text-2xl font-bold text-gray-800">
                        {target.target_weight} kg
                      </h3>
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(target.status)}`}>
                      {getStatusIcon(target.status)}
                      {target.status}
                    </span>
                  </div>
                  
                  {/* Action Buttons */}
                  {isActive && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(target)}
                        className="p-2 text-gray-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(target.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-3">
                  {/* Weights Overview */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="p-2 rounded bg-gray-50">
                      <div className="text-gray-500">Target</div>
                      <div className="font-semibold text-gray-800">{target.target_weight} kg</div>
                    </div>
                    <div className="p-2 rounded bg-gray-50">
                      <div className="text-gray-500">Start</div>
                      <div className="font-semibold text-gray-800">{target.starting_weight ?? '-'} kg</div>
                    </div>
                    <div className="p-2 rounded bg-gray-50">
                      <div className="text-gray-500">{thirdLabel}</div>
                      <div className="font-semibold text-gray-800">{target.final_weight ?? '-'} kg</div>
                    </div>
                  </div>
                  {/* Target Date */}
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-sm">
                      Target: {format(new Date(target.date_of_target), 'MMMM dd, yyyy')}
                    </span>
                    {isActive && isPast && (
                      <span className="text-xs text-orange-600 font-medium">(Overdue)</span>
                    )}
                  </div>

                  {/* Created Date */}
                  <div className="text-sm text-gray-500">
                    Created: {format(new Date(target.created_date), 'MMM dd, yyyy')}
                  </div>

                  {/* Weight to Lose (for active targets) */}
                  {isActive && weightToLoseNum !== null && (
                    <div className={`p-3 rounded-lg ${
                      weightToLoseNum <= 0 ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      <p className={`text-sm font-medium ${
                        weightToLoseNum <= 0 ? 'text-green-700' : 'text-blue-700'
                      }`}>
                        {weightToLoseNum <= 0 ? 
                          '🎉 Goal achieved! Mark as completed?' : 
                          `${weightToLoseNum.toFixed(1)} kg to go`
                        }
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons for Active Targets */}
                {isActive && (
                  <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
                    <button
                      onClick={() => handleComplete(target.id)}
                      className="flex-1 btn btn-sm bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-1"
                    >
                      <CheckCircle size={16} />
                      Complete
                    </button>
                    <button
                      onClick={() => handleCancel(target.id)}
                      className="flex-1 btn btn-sm btn-secondary flex items-center justify-center gap-1"
                    >
                      <XCircle size={16} />
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default TargetEntry;

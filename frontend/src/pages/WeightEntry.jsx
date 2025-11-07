import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { weightAPI } from '../services/api';
import { Plus, Edit2, Trash2, Save, X, Calendar, Scale } from 'lucide-react';
import { format } from 'date-fns';

function WeightEntry() {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    date_of_measurement: new Date().toISOString().split('T')[0],
    weight: '',
    body_fat_percentage: '',
    muscle_mass: '',
    notes: ''
  });

  const queryClient = useQueryClient();

  // Fetch weights
  const { data: weights, isLoading } = useQuery({
    queryKey: ['weights'],
    queryFn: async () => {
      const response = await weightAPI.list();
      return response.data;
    },
  });

  // Add weight mutation
  const addMutation = useMutation({
    mutationFn: (data) => weightAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['weights']);
      queryClient.invalidateQueries(['dashboard']);
      setIsAdding(false);
      resetForm();
    },
  });

  // Update weight mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => weightAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['weights']);
      queryClient.invalidateQueries(['dashboard']);
      setEditingId(null);
      resetForm();
    },
  });

  // Delete weight mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => weightAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['weights']);
      queryClient.invalidateQueries(['dashboard']);
    },
  });

  const resetForm = () => {
    setFormData({
      date_of_measurement: new Date().toISOString().split('T')[0],
      weight: '',
      body_fat_percentage: '',
      muscle_mass: '',
      notes: ''
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const submitData = {
      date_of_measurement: formData.date_of_measurement,
      weight: parseFloat(formData.weight),
      body_fat_percentage: formData.body_fat_percentage ? parseFloat(formData.body_fat_percentage) : null,
      muscle_mass: formData.muscle_mass ? parseFloat(formData.muscle_mass) : null,
      notes: formData.notes || null,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: submitData });
    } else {
      addMutation.mutate(submitData);
    }
  };

  const handleEdit = (weight) => {
    setFormData({
      date_of_measurement: weight.date_of_measurement,
      weight: weight.weight,
      body_fat_percentage: weight.body_fat_percentage || '',
      muscle_mass: weight.muscle_mass || '',
      notes: weight.notes || ''
    });
    setEditingId(weight.id);
    setIsAdding(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    resetForm();
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this weight entry?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading weights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Weight Entries</h1>
          <p className="text-gray-600 mt-1">Track your weight measurements over time</p>
        </div>
        {!isAdding && !editingId && (
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            Add Weight
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingId) && (
        <div className="card bg-blue-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-800">
              {editingId ? 'Edit Weight Entry' : 'Add New Weight Entry'}
            </h2>
            <button
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={24} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.date_of_measurement}
                  onChange={(e) => setFormData({ ...formData, date_of_measurement: e.target.value })}
                  className="input"
                  required
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Weight */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Weight (kg) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                  className="input"
                  placeholder="75.5"
                  required
                  min="0"
                  max="500"
                />
              </div>

              {/* Body Fat % */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Body Fat % (optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.body_fat_percentage}
                  onChange={(e) => setFormData({ ...formData, body_fat_percentage: e.target.value })}
                  className="input"
                  placeholder="20.5"
                  min="0"
                  max="100"
                />
              </div>

              {/* Muscle Mass */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Muscle Mass (kg) (optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.muscle_mass}
                  onChange={(e) => setFormData({ ...formData, muscle_mass: e.target.value })}
                  className="input"
                  placeholder="35.0"
                  min="0"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="input"
                rows="3"
                placeholder="Any observations, feelings, or context about this measurement..."
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
                {addMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>

            {(addMutation.isError || updateMutation.isError) && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                Error: {addMutation.error?.message || updateMutation.error?.message}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Weight List */}
      {weights && weights.length === 0 ? (
        <div className="card text-center py-12">
          <Scale className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No weight entries yet</h3>
          <p className="text-gray-500 mb-4">Start tracking your weight to see your progress</p>
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-primary"
          >
            Add Your First Entry
          </button>
        </div>
      ) : (
        <div className="card">
          {/* Mobile Card View */}
          <div className="block md:hidden space-y-4">
            {weights?.map((weight) => (
              <div
                key={weight.id}
                className="p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-gray-400" />
                    <span className="font-semibold text-gray-800">
                      {format(new Date(weight.date_of_measurement), 'MMM dd, yyyy')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(weight)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(weight.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Weight</span>
                    <span className="text-primary-600 font-semibold">{weight.weight} kg</span>
                  </div>
                  {weight.body_fat_percentage && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Body Fat %</span>
                      <span className="text-gray-800">{weight.body_fat_percentage}%</span>
                    </div>
                  )}
                  {weight.muscle_mass && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Muscle Mass</span>
                      <span className="text-gray-800">{weight.muscle_mass} kg</span>
                    </div>
                  )}
                  {weight.notes && (
                    <div className="pt-2 border-t border-gray-300">
                      <span className="text-gray-600">Notes: </span>
                      <span className="text-gray-800">{weight.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Weight</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Body Fat %</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Muscle Mass</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Notes</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {weights?.map((weight) => (
                  <tr
                    key={weight.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400" />
                        <span className="font-medium text-gray-800">
                          {format(new Date(weight.date_of_measurement), 'MMM dd, yyyy')}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-primary-600 font-semibold">{weight.weight} kg</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {weight.body_fat_percentage ? `${weight.body_fat_percentage}%` : '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {weight.muscle_mass ? `${weight.muscle_mass} kg` : '-'}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-sm max-w-xs truncate">
                      {weight.notes || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(weight)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(weight.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>{weights?.length}</strong> total entries •{' '}
              Latest: <strong>{weights?.[0]?.weight} kg</strong> on{' '}
              <strong>{format(new Date(weights?.[0]?.date_of_measurement || new Date()), 'MMM dd')}</strong>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default WeightEntry;
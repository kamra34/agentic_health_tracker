import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, weightAPI } from '../services/api';
import { Save, RefreshCw } from 'lucide-react';

function Profile() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    email: '',
    sex: '',
    height: '',
    activity_level: '',
    date_of_birth: '',
    timezone: '',
  });

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => (await userAPI.getProfile()).data,
  });

  useEffect(() => {
    if (me) {
      setForm({
        name: me.name || '',
        email: me.email || '',
        sex: me.sex || '',
        height: me.height ?? '',
        activity_level: me.activity_level || '',
        date_of_birth: me.date_of_birth || '',
        timezone: me.timezone || 'UTC',
      });
    }
  }, [me]);

  const updateMutation = useMutation({
    mutationFn: (data) => userAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['me']);
      queryClient.invalidateQueries(['dashboard']);
      queryClient.invalidateQueries(['stats']);
    },
  });

  const backfillMutation = useMutation({
    mutationFn: (overwrite) => weightAPI.backfillEstimates(overwrite),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard']);
      queryClient.invalidateQueries(['weights']);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      name: form.name || undefined,
      email: form.email || undefined,
      sex: form.sex || undefined,
      height: form.height ? parseFloat(form.height) : undefined,
      activity_level: form.activity_level || undefined,
      date_of_birth: form.date_of_birth || undefined,
      timezone: form.timezone || undefined,
    };
    updateMutation.mutate(payload, {
      onSuccess: () => {
        // After profile changes, recompute estimates to keep data consistent
        backfillMutation.mutate(true);
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Profile</h1>
      <p className="text-gray-600 mb-6">Update your information. We use these values to compute BMI and estimates.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input className="input" value={form.name}
              onChange={(e)=>setForm({...form, name:e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="input" value={form.email}
              onChange={(e)=>setForm({...form, email:e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sex</label>
            <select className="input" value={form.sex}
              onChange={(e)=>setForm({...form, sex:e.target.value})}>
              <option value="">--</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height (cm)</label>
            <input type="number" step="0.1" min="0" className="input" value={form.height}
              onChange={(e)=>setForm({...form, height:e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Level</label>
            <select className="input" value={form.activity_level}
              onChange={(e)=>setForm({...form, activity_level:e.target.value})}>
              <option value="">--</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
            <input type="date" className="input" value={form.date_of_birth || ''}
              onChange={(e)=>setForm({...form, date_of_birth:e.target.value})} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
              <span className="text-xs text-gray-500 ml-2">(Used for chat and date calculations)</span>
            </label>
            <select className="input" value={form.timezone}
              onChange={(e)=>setForm({...form, timezone:e.target.value})}>
              <option value="UTC">UTC (Default)</option>
              <optgroup label="Europe">
                <option value="Europe/Stockholm">Europe/Stockholm (Sweden)</option>
                <option value="Europe/London">Europe/London (UK)</option>
                <option value="Europe/Paris">Europe/Paris (France)</option>
                <option value="Europe/Berlin">Europe/Berlin (Germany)</option>
                <option value="Europe/Madrid">Europe/Madrid (Spain)</option>
                <option value="Europe/Rome">Europe/Rome (Italy)</option>
              </optgroup>
              <optgroup label="America">
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                <option value="America/Denver">America/Denver (MST/MDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="America/Toronto">America/Toronto (Canada - EST)</option>
              </optgroup>
              <optgroup label="Asia">
                <option value="Asia/Tokyo">Asia/Tokyo (Japan)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (China)</option>
                <option value="Asia/Dubai">Asia/Dubai (UAE)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (India)</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
              </optgroup>
              <optgroup label="Pacific">
                <option value="Australia/Sydney">Australia/Sydney</option>
                <option value="Pacific/Auckland">Pacific/Auckland (New Zealand)</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary flex items-center gap-2" disabled={updateMutation.isPending}>
            <Save size={16} /> {updateMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={()=>backfillMutation.mutate(true)}
            className="btn btn-secondary flex items-center gap-2" disabled={backfillMutation.isPending}>
            <RefreshCw size={16} /> {backfillMutation.isPending ? 'Recomputing...' : 'Recompute Estimates'}
          </button>
        </div>

        {(updateMutation.isError || backfillMutation.isError) && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mt-2">
            {updateMutation.error?.response?.data?.detail || backfillMutation.error?.response?.data?.detail || 'Operation failed'}
          </div>
        )}
      </form>
    </div>
  );
}

export default Profile;


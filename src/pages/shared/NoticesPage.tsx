import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Bell, Calendar } from 'lucide-react';

interface Notice {
  id: string;
  title: string;
  description: string;
  image_name: string;
  publicUrl?: string;
  created_at: string;
}

export default function NoticesPage() {
  const { profile } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readNotices, setReadNotices] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!profile) return;
    loadNotices();
    loadReadNotices();
  }, [profile]);

  const loadNotices = async () => {
    try {
      setLoading(true);

      // Fetch content from notice_content table (same as home page)
      const { data: contentData, error: contentError } = await supabase
        .from('notice_content')
        .select('*')
        .order('created_at', { ascending: false });

      if (contentError) throw contentError;

      // Get public URLs for images
      const noticesWithUrls = contentData.map(content => {
        const { data: publicUrl } = supabase.storage
          .from('notice')
          .getPublicUrl(content.image_name);

        return {
          ...content,
          publicUrl: publicUrl.publicUrl,
          id: content.id,
          title: content.title,
          description: content.description,
          created_at: content.created_at
        };
      });

      setNotices(noticesWithUrls);
    } catch (err: any) {
      console.error('Error loading notices:', err);
      setError('Failed to load notices');
    } finally {
      setLoading(false);
    }
  };

  const loadReadNotices = () => {
    if (!profile) return;
    
    try {
      const stored = localStorage.getItem(`read_notices_${profile.id}`);
      if (stored) {
        setReadNotices(new Set(JSON.parse(stored)));
      }
    } catch (err) {
      console.error('Error loading read notices:', err);
    }
  };

  const markAsRead = (noticeId: string) => {
    if (!profile) return;
    
    const newReadNotices = new Set(readNotices);
    newReadNotices.add(noticeId);
    setReadNotices(newReadNotices);
    
    try {
      localStorage.setItem(
        `read_notices_${profile.id}`, 
        JSON.stringify(Array.from(newReadNotices))
      );
    } catch (err) {
      console.error('Error saving read notice:', err);
    }
  };

  const markAllAsRead = () => {
    if (!profile) return;
    
    const allNoticeIds = new Set(notices.map(notice => notice.id));
    setReadNotices(allNoticeIds);
    
    try {
      localStorage.setItem(
        `read_notices_${profile.id}`, 
        JSON.stringify(Array.from(allNoticeIds))
      );
    } catch (err) {
      console.error('Error saving read notices:', err);
    }
  };

  const unreadCount = notices.filter(notice => !readNotices.has(notice.id)).length;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-red-100 text-red-600 p-3 rounded-lg">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Notices & Announcements</h1>
            <p className="text-slate-600 mt-1 text-sm sm:text-base">Stay updated with latest circulars and announcements</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div className="text-sm text-slate-600">
            <span className="font-medium">{unreadCount}</span> unread of <span className="font-medium">{notices.length}</span> total notices
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Mark All as Read
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            <p className="text-slate-600">Loading notices...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        ) : notices.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-12 text-center">
            <Bell className="h-12 w-12 mx-auto mb-3 text-slate-400" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Notices Available</h3>
            <p className="text-slate-600">There are no notices at the moment. Check back later for updates.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {notices.map(notice => {
              const isRead = readNotices.has(notice.id);

              return (
                <div
                  key={notice.id}
                  className={`bg-white rounded-xl shadow-lg border overflow-hidden transition-all cursor-pointer hover:shadow-xl ${
                    isRead
                      ? 'border-slate-200 hover:shadow-md'
                      : 'border-blue-200 bg-blue-50/30 hover:shadow-lg'
                  }`}
                  onClick={() => markAsRead(notice.id)}
                >
                  {notice.publicUrl && (
                    <div className="aspect-video overflow-hidden">
                      <img
                        src={notice.publicUrl}
                        alt={notice.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h2 className={`text-lg font-semibold line-clamp-2 ${isRead ? 'text-slate-800' : 'text-slate-900'}`}>
                        {notice.title}
                      </h2>
                      {!isRead && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 ml-2 mt-1"></span>
                      )}
                    </div>

                    {notice.description && (
                      <p className={`text-sm mb-4 line-clamp-3 ${isRead ? 'text-slate-600' : 'text-slate-700'}`}>
                        {notice.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(notice.created_at).toLocaleDateString('en-IN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
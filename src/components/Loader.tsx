// Simple loading spinner component

interface LoaderProps {
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Loader({ message = 'Loading...', className = '', size = 'md' }: LoaderProps) {
  const sizeClasses = size === 'sm' ? 'h-6 w-6' : size === 'lg' ? 'h-12 w-12' : 'h-8 w-8';
  return (
    <div className={`text-center py-8 ${className}`.trim()}>
      <div className={`animate-spin rounded-full ${sizeClasses} border-2 border-blue-200 border-t-blue-600 mx-auto`}></div>
      {message && <p className="mt-3 text-slate-600">{message}</p>}
    </div>
  );
}

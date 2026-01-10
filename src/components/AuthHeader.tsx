import { Link, useLocation } from 'react-router-dom';
import krctLogo from '@/assets/logo1.png';


export default function AuthHeader() {
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-7xl mx-auto flex justify-between items-center px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-3">
          <img src={krctLogo} alt="KRCT Logo" className="h-12 sm:h-16 w-auto" />
         
        </div>
        <div className="hidden md:block text-center">
          <div className="text-2xl lg:text-3xl xl:text-4xl font-bold text-blue-600">K.Ramakrishnan College of Technology</div>
          <div className="text-base lg:text-xl xl:text-2xl font-semibold text-red-600">Autonomous</div>
        </div>
        <div>
          {isAuthPage ? (
            <Link to="/" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Home</Link>
          ) : (
            <Link to="/login" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Login</Link>
          )}
        </div>
      </div>
    </header>
  );
}

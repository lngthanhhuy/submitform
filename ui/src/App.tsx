import { Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import CareerPage from './pages/CareerPage';

function App() {
  return (
    <>
      <ToastContainer theme="colored"/>
      <Routes>
        <Route
          path='/'
          element={<CareerPage />}
        />
      </Routes>
    </>
  );
}

export default App

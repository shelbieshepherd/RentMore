// RentVue - React store (thin wrapper over shared-store module, DB-backed)
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import {
  subscribe, getSnapshot, hydrateFromLocalStorage,
  addProperty, updateProperty, addTenant, addGuest,
  addMaintenanceRequest, updateMaintenanceRequest, addMaintenanceNote,
  addBooking, updateBooking, addPayment, updatePaymentStatus,
  addDocument, signDocument, signDocumentOwner,
  addTemplate, updateTemplate, deleteTemplate,
  addGuestMessage,
  updatePropertyGuide,
  addVendor, updateVendor, deleteVendor,
  addVendorPayout, updateVendorPayout,
  addOwnerCharge, addOwner, updateOwner, deleteOwner, pushPaidPayout,
  addStoredPaymentMethod, removeStoredPaymentMethod,
  addOwnerPayout, updateOwnerPayout,
  setCompanyId,
  clearPersistError,
  type StoreState,
} from "./shared-store";

interface StoreActions {
  addProperty: typeof addProperty;
  updateProperty: typeof updateProperty;
  addTenant: typeof addTenant;
  addGuest: typeof addGuest;
  addMaintenanceRequest: typeof addMaintenanceRequest;
  updateMaintenanceRequest: typeof updateMaintenanceRequest;
  addMaintenanceNote: typeof addMaintenanceNote;
  addBooking: typeof addBooking;
  updateBooking: typeof updateBooking;
  addPayment: typeof addPayment;
  updatePaymentStatus: typeof updatePaymentStatus;
  addDocument: typeof addDocument;
  signDocument: typeof signDocument;
  signDocumentOwner: typeof signDocumentOwner;
  addTemplate: typeof addTemplate;
  updateTemplate: typeof updateTemplate;
  deleteTemplate: typeof deleteTemplate;
  addGuestMessage: typeof addGuestMessage;
  updatePropertyGuide: typeof updatePropertyGuide;
  addVendor: typeof addVendor;
  updateVendor: typeof updateVendor;
  deleteVendor: typeof deleteVendor;
  addVendorPayout: typeof addVendorPayout;
  updateVendorPayout: typeof updateVendorPayout;
  addOwnerCharge: typeof addOwnerCharge;
  addOwner: typeof addOwner;
  updateOwner: typeof updateOwner;
  deleteOwner: typeof deleteOwner;
  pushPaidPayout: typeof pushPaidPayout;
  addOwnerPayout: typeof addOwnerPayout;
  updateOwnerPayout: typeof updateOwnerPayout;
  addStoredPaymentMethod: typeof addStoredPaymentMethod;
  removeStoredPaymentMethod: typeof removeStoredPaymentMethod;
  setCompanyId: typeof setCompanyId;
  clearPersistError: typeof clearPersistError;
}

type StoreContextType = StoreState & StoreActions;
const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StoreState>(() => getSnapshot());

  useEffect(() => {
    hydrateFromLocalStorage(); // triggers DB sync
    setSnapshot(getSnapshot());
    const unsub = subscribe(() => setSnapshot(getSnapshot()));
    return unsub;
  }, []);

  return (
    <StoreContext.Provider value={{
      ...snapshot,
      addProperty, updateProperty, addTenant, addGuest,
      addMaintenanceRequest, updateMaintenanceRequest, addMaintenanceNote,
      addBooking, updateBooking, addPayment, updatePaymentStatus,
      addDocument, signDocument, signDocumentOwner,
      addTemplate, updateTemplate, deleteTemplate,
      addGuestMessage,
      updatePropertyGuide,
      addVendor, updateVendor, deleteVendor,
      addVendorPayout, updateVendorPayout,
      addOwnerCharge, addOwner, updateOwner, deleteOwner, pushPaidPayout,
      addOwnerPayout, updateOwnerPayout,
      addStoredPaymentMethod, removeStoredPaymentMethod,
      setCompanyId,
      clearPersistError,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextType {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

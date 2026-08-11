import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useStore } from "~/lib/store";
import { PhotoUploader } from "~/lib/photo-upload";
import type { PropertyGuide } from "~/lib/data";

export const Route = createFileRoute("/onboard/$propertyId")({
  component: OnboardPage,
});

const SITE_URL = "https://rentmorevrs.com";
const HOUSE_RULE_PRESETS = [
  "No smoking inside the property",
  "No pets allowed",
  "Quiet hours: 10 PM – 7 AM",
  "No parties or events",
  "Maximum occupancy as listed",
];

function OnboardPage() {
  const params = Route.useParams();
  const { propertyId } = params as { propertyId: string };
  const store = useStore();

  const prop = store.properties.find(p => p.id === propertyId);
  const existingGuide = store.propertyGuides.find(g => g.propertyId === propertyId);
  const isUpdate = !!existingGuide;

  // Form state
  const [submitted, setSubmitted] = useState(false);
  const [ownerName, setOwnerName] = useState(existingGuide?.ownerName || "");
  const [einSsn, setEinSsn] = useState(existingGuide?.einSsn || "");
  const [routingNumber, setRoutingNumber] = useState(existingGuide?.routingNumber || "");
  const [accountNumber, setAccountNumber] = useState(existingGuide?.accountNumber || "");
  const [showAccount, setShowAccount] = useState(false);

  const [wifiName, setWifiName] = useState(existingGuide?.wifiName || "");
  const [wifiPassword, setWifiPassword] = useState(existingGuide?.wifiPassword || "");
  const [showWifi, setShowWifi] = useState(false);

  const [doorCode, setDoorCode] = useState(existingGuide?.doorCode || "");
  const [lockboxCode, setLockboxCode] = useState(existingGuide?.lockboxCode || "");
  const [masterDoorCode, setMasterDoorCode] = useState(existingGuide?.masterDoorCode || "");
  const [keyPickup, setKeyPickup] = useState(existingGuide?.keyPickupInstructions || "");

  const [appliances, setAppliances] = useState<{ name: string; makeModel: string; notes: string }[]>(
    existingGuide?.applianceInfo?.length ? existingGuide.applianceInfo : [{ name: "", makeModel: "", notes: "" }]
  );

  const [houseRules, setHouseRules] = useState<string[]>(existingGuide?.houseRules?.length ? existingGuide.houseRules : [""]);

  const [parkingInfo, setParkingInfo] = useState(existingGuide?.parkingInfo || "");
  const [parkingSpots, setParkingSpots] = useState(existingGuide?.parkingSpots ?? 0);

  const [emergencyContacts, setEmergencyContacts] = useState<{ name: string; relationship: string; phone: string }[]>(
    existingGuide?.emergencyContacts?.length ? existingGuide.emergencyContacts : [{ name: "", relationship: "", phone: "" }]
  );
  const [nearestHospital, setNearestHospital] = useState(existingGuide?.nearestHospital || "");
  const [nearestHospitalAddress, setNearestHospitalAddress] = useState(existingGuide?.nearestHospitalAddress || "");
  const [fireDepartment, setFireDepartment] = useState(existingGuide?.fireDepartment || "");
  const [policeNonEmergency, setPoliceNonEmergency] = useState(existingGuide?.policeNonEmergency || "");

  const [utilityInfo, setUtilityInfo] = useState({
    electric: existingGuide?.utilityInfo?.electric || "",
    electricAccount: existingGuide?.utilityInfo?.electricAccount || "",
    water: existingGuide?.utilityInfo?.water || "",
    waterAccount: existingGuide?.utilityInfo?.waterAccount || "",
    gas: existingGuide?.utilityInfo?.gas || "",
    gasAccount: existingGuide?.utilityInfo?.gasAccount || "",
    trash: existingGuide?.utilityInfo?.trash || "",
    other: existingGuide?.utilityInfo?.other || "",
  });

  const [amenities, setAmenities] = useState<{ name: string; accessInfo: string }[]>(
    existingGuide?.amenityInfo?.length ? existingGuide.amenityInfo : [{ name: "", accessInfo: "" }]
  );

  const [additionalNotes, setAdditionalNotes] = useState(existingGuide?.additionalNotes || "");
  const [photoImages, setPhotoImages] = useState<any[]>(prop?.images ?? []);

  const [errors, setErrors] = useState<string[]>([]);

  // Pre-fill effect when existingGuide changes
  useEffect(() => {
    if (existingGuide) {
      setOwnerName(existingGuide.ownerName || "");
      setEinSsn(existingGuide.einSsn || "");
      setRoutingNumber(existingGuide.routingNumber || "");
      setAccountNumber(existingGuide.accountNumber || "");
      setWifiName(existingGuide.wifiName || "");
      setWifiPassword(existingGuide.wifiPassword || "");
      setDoorCode(existingGuide.doorCode || "");
      setLockboxCode(existingGuide.lockboxCode || "");
    setMasterDoorCode(existingGuide.masterDoorCode || "");
      setKeyPickup(existingGuide.keyPickupInstructions || "");
      setAppliances(existingGuide.applianceInfo?.length ? existingGuide.applianceInfo : [{ name: "", makeModel: "", notes: "" }]);
      setHouseRules(existingGuide.houseRules?.length ? existingGuide.houseRules : [""]);
      setParkingInfo(existingGuide.parkingInfo || "");
      setParkingSpots(existingGuide.parkingSpots ?? 0);
      setEmergencyContacts(existingGuide.emergencyContacts?.length ? existingGuide.emergencyContacts : [{ name: "", relationship: "", phone: "" }]);
      setNearestHospital(existingGuide.nearestHospital || "");
      setNearestHospitalAddress(existingGuide.nearestHospitalAddress || "");
      setFireDepartment(existingGuide.fireDepartment || "");
      setPoliceNonEmergency(existingGuide.policeNonEmergency || "");
      setUtilityInfo({
        electric: existingGuide.utilityInfo?.electric || "",
        electricAccount: existingGuide.utilityInfo?.electricAccount || "",
        water: existingGuide.utilityInfo?.water || "",
        waterAccount: existingGuide.utilityInfo?.waterAccount || "",
        gas: existingGuide.utilityInfo?.gas || "",
        gasAccount: existingGuide.utilityInfo?.gasAccount || "",
        trash: existingGuide.utilityInfo?.trash || "",
        other: existingGuide.utilityInfo?.other || "",
      });
      setAmenities(existingGuide.amenityInfo?.length ? existingGuide.amenityInfo : [{ name: "", accessInfo: "" }]);
      setAdditionalNotes(existingGuide.additionalNotes || "");
    setPhotoImages(prop?.images ?? []);
    }
  }, [existingGuide?.id]);

  // Invalid property
  if (!prop) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-4xl mb-4">🏠</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Property Not Found</h1>
          <p className="text-sm text-gray-500 mb-4">
            We couldn't find a property matching this link. If you believe this is an error, please contact your property manager.
          </p>
          <p className="text-sm text-gray-500">
            📞 <strong>Eastman Premier Rentals</strong><br />
            (555) 123-4567<br />
            support@eastmanpremier.com
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Onboarding Complete!</h1>
          <p className="text-sm text-gray-500 mb-4">
            Thank you for providing your property details for <strong>{prop.name}</strong>. Your property manager has been notified and will review your submission.
          </p>
          <p className="text-xs text-gray-400">
            If you need to update anything, you can revisit this page at any time.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!ownerName.trim()) errs.push("Owner name is required.");
    if (!doorCode.trim()) errs.push("Door code is required.");
    if (!wifiName.trim()) errs.push("Wi-Fi network name is required.");
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    const guide: Partial<PropertyGuide> = {
      propertyId,
      ownerName: ownerName.trim(),
      einSsn: einSsn.trim(),
      routingNumber: routingNumber.trim(),
      accountNumber: accountNumber.trim(),
      doorCode: doorCode.trim(),
      lockboxCode: lockboxCode.trim(),
      masterDoorCode: masterDoorCode.trim(),
      keyPickupInstructions: keyPickup.trim(),
      wifiName: wifiName.trim(),
      wifiPassword: wifiPassword.trim(),
      houseRules: houseRules.filter(r => r.trim()),
      parkingInfo: parkingInfo.trim(),
      parkingSpots: parkingSpots,
      emergencyContacts: emergencyContacts.filter(c => c.name.trim() || c.phone.trim()),
      nearestHospital: nearestHospital.trim(),
      nearestHospitalAddress: nearestHospitalAddress.trim(),
      fireDepartment: fireDepartment.trim(),
      policeNonEmergency: policeNonEmergency.trim(),
      utilityInfo: {
        electric: utilityInfo.electric.trim(),
        electricAccount: utilityInfo.electricAccount.trim(),
        water: utilityInfo.water.trim(),
        waterAccount: utilityInfo.waterAccount.trim(),
        gas: utilityInfo.gas.trim(),
        gasAccount: utilityInfo.gasAccount.trim(),
        trash: utilityInfo.trash.trim(),
        other: utilityInfo.other.trim(),
      },
      amenityInfo: amenities.filter(a => a.name.trim()),
      applianceInfo: appliances.filter(a => a.name.trim()),
      additionalNotes: additionalNotes.trim(),
      checkInTime: existingGuide?.checkInTime || "3:00 PM",
      checkoutTime: existingGuide?.checkoutTime || "11:00 AM",
    };

    store.updatePropertyGuide(propertyId, guide);
    store.updateProperty(propertyId, { images: photoImages });
    setSubmitted(true);
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f3c52] focus:border-transparent";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const sectionClass = "bg-white rounded-xl shadow-sm border border-gray-200 p-5";
  const sectionTitleClass = "text-base font-semibold text-gray-800 mb-4 flex items-center gap-2";

  return (
    <div className="min-h-dvh bg-gray-50">
      {/* Header */}
      <header className="bg-[#0f3c52] text-white px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏘️</span>
            <div>
              <h1 className="text-lg font-bold">Eastman Premier Rentals</h1>
              <p className="text-xs text-gray-300">Property Onboarding</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{prop.name}</p>
            <p className="text-xs text-gray-300">{prop.address}</p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {isUpdate && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
            ℹ️ This property has already been set up. You can review and update your information below.
          </div>
        )}

        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm font-medium text-red-800 mb-1">Please fix the following:</p>
            <ul className="text-sm text-red-700 list-disc list-inside">
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Photos */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>🖼️</span> Property Photos</h2>
            <PhotoUploader images={photoImages} onChange={setPhotoImages} maxPhotos={20} />
          </div>
          {/* Section 1: Banking & Tax */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>🏦</span> Banking & Tax</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Owner Name *</label>
                <input className={inputClass} value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Full legal name" />
              </div>
              <div>
                <label className={labelClass}>EIN / SSN</label>
                <input className={inputClass} value={einSsn} onChange={e => setEinSsn(e.target.value)} placeholder="XX-XXXXXXX" />
              </div>
              <div>
                <label className={labelClass}>Routing Number</label>
                <input className={inputClass} value={routingNumber} onChange={e => setRoutingNumber(e.target.value)} placeholder="9-digit routing number" />
              </div>
              <div>
                <label className={labelClass}>Account Number</label>
                <div className="relative">
                  <input className={`${inputClass} pr-10`} type={showAccount ? "text" : "password"} value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder="Bank account number" />
                  <button type="button" onClick={() => setShowAccount(!showAccount)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                    {showAccount ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Wi-Fi & Connectivity */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>📶</span> Wi-Fi & Connectivity</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Network Name *</label>
                <input className={inputClass} value={wifiName} onChange={e => setWifiName(e.target.value)} placeholder="e.g. BeachHouse_Guest" />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <div className="relative">
                  <input className={`${inputClass} pr-10`} type={showWifi ? "text" : "password"} value={wifiPassword} onChange={e => setWifiPassword(e.target.value)} placeholder="Wi-Fi password" />
                  <button type="button" onClick={() => setShowWifi(!showWifi)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600">
                    {showWifi ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Access & Locks */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>🔑</span> Access & Locks</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Door Code *</label>
                <input className={inputClass} value={doorCode} onChange={e => setDoorCode(e.target.value)} placeholder="e.g. 4829#" />
              <div>
                <label className={labelClass}>Master Door Code</label>
                <input className={inputClass} value={masterDoorCode} onChange={e => setMasterDoorCode(e.target.value)} placeholder="e.g. 0000#" />
              </div>
              </div>
              <div>
                <label className={labelClass}>Lockbox Code</label>
                <input className={inputClass} value={lockboxCode} onChange={e => setLockboxCode(e.target.value)} placeholder="Lockbox combination" />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelClass}>Key Pickup Instructions</label>
              <textarea className={inputClass} rows={2} value={keyPickup} onChange={e => setKeyPickup(e.target.value)} placeholder="e.g. Keys are in the lockbox by the front door. Code is above." />
            </div>
          </div>

          {/* Section 4: Appliances */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={sectionTitleClass + " mb-0"}><span>🛠️</span> Appliances</h2>
              <button type="button" onClick={() => setAppliances([...appliances, { name: "", makeModel: "", notes: "" }])} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add Appliance</button>
            </div>
            {appliances.map((a, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 mb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400 font-medium">#{i + 1}</span>
                  <button type="button" onClick={() => setAppliances(appliances.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm">✕ Remove</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Appliance Name</label>
                    <input className={inputClass} value={a.name} onChange={e => { const u = [...appliances]; u[i] = { ...u[i], name: e.target.value }; setAppliances(u); }} placeholder="e.g. Dishwasher" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Make / Model</label>
                    <input className={inputClass} value={a.makeModel} onChange={e => { const u = [...appliances]; u[i] = { ...u[i], makeModel: e.target.value }; setAppliances(u); }} placeholder="e.g. Bosch 300 Series" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Notes</label>
                    <input className={inputClass} value={a.notes} onChange={e => { const u = [...appliances]; u[i] = { ...u[i], notes: e.target.value }; setAppliances(u); }} placeholder="e.g. Hold button 3 secs" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Section 5: House Rules */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={sectionTitleClass + " mb-0"}><span>📋</span> House Rules</h2>
              <button type="button" onClick={() => setHouseRules([...houseRules, ""])} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add Rule</button>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {HOUSE_RULE_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => { if (!houseRules.includes(preset)) setHouseRules([...houseRules.filter(r => r.trim()), preset]); }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-300"
                >
                  + {preset.slice(0, 40)}{preset.length > 40 ? "…" : ""}
                </button>
              ))}
            </div>
            {houseRules.map((rule, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className={inputClass} value={rule} onChange={e => { const u = [...houseRules]; u[i] = e.target.value; setHouseRules(u); }} placeholder="e.g. No smoking indoors" />
                <button type="button" onClick={() => setHouseRules(houseRules.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg px-1 shrink-0">&times;</button>
              </div>
            ))}
          </div>

          {/* Section 6: Parking */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>🅿️</span> Parking</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Parking Instructions</label>
                <textarea className={inputClass} rows={2} value={parkingInfo} onChange={e => setParkingInfo(e.target.value)} placeholder="e.g. Driveway fits 3 cars. Street parking OK." />
              </div>
              <div>
                <label className={labelClass}>Number of Spots</label>
                <input className={inputClass} type="number" min={0} value={parkingSpots} onChange={e => setParkingSpots(Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Section 7: Emergency Contacts */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={sectionTitleClass + " mb-0"}><span>🚨</span> Emergency Contacts</h2>
              <button type="button" onClick={() => setEmergencyContacts([...emergencyContacts, { name: "", relationship: "", phone: "" }])} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add Contact</button>
            </div>
            {emergencyContacts.map((c, i) => (
              <div key={i} className="border border-gray-100 rounded-lg p-3 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400 font-medium">Contact #{i + 1}</span>
                  <button type="button" onClick={() => setEmergencyContacts(emergencyContacts.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-sm">✕ Remove</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Name</label>
                    <input className={inputClass} value={c.name} onChange={e => { const u = [...emergencyContacts]; u[i] = { ...u[i], name: e.target.value }; setEmergencyContacts(u); }} placeholder="Contact name" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Relationship</label>
                    <input className={inputClass} value={c.relationship} onChange={e => { const u = [...emergencyContacts]; u[i] = { ...u[i], relationship: e.target.value }; setEmergencyContacts(u); }} placeholder="e.g. Neighbor" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Phone</label>
                    <input className={inputClass} value={c.phone} onChange={e => { const u = [...emergencyContacts]; u[i] = { ...u[i], phone: e.target.value }; setEmergencyContacts(u); }} placeholder="(555) 000-0000" />
                  </div>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              <div>
                <label className={labelClass}>Nearest Hospital</label>
                <input className={inputClass} value={nearestHospital} onChange={e => setNearestHospital(e.target.value)} placeholder="Hospital name" />
              </div>
              <div>
                <label className={labelClass}>Hospital Address</label>
                <input className={inputClass} value={nearestHospitalAddress} onChange={e => setNearestHospitalAddress(e.target.value)} placeholder="Street address" />
              </div>
              <div>
                <label className={labelClass}>Fire Department</label>
                <input className={inputClass} value={fireDepartment} onChange={e => setFireDepartment(e.target.value)} placeholder="e.g. Malibu Fire Station #71" />
              </div>
              <div>
                <label className={labelClass}>Police (Non-Emergency)</label>
                <input className={inputClass} value={policeNonEmergency} onChange={e => setPoliceNonEmergency(e.target.value)} placeholder="e.g. (555) 000-1111" />
              </div>
            </div>
          </div>

          {/* Section 8: Utilities */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>💡</span> Utilities</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Electric Provider</label>
                <input className={inputClass} value={utilityInfo.electric} onChange={e => setUtilityInfo({ ...utilityInfo, electric: e.target.value })} placeholder="e.g. Southern California Edison" />
              </div>
              <div>
                <label className={labelClass}>Electric Account #</label>
                <input className={inputClass} value={utilityInfo.electricAccount} onChange={e => setUtilityInfo({ ...utilityInfo, electricAccount: e.target.value })} placeholder="Account number" />
              </div>
              <div>
                <label className={labelClass}>Water Provider</label>
                <input className={inputClass} value={utilityInfo.water} onChange={e => setUtilityInfo({ ...utilityInfo, water: e.target.value })} placeholder="e.g. City of Santa Monica" />
              </div>
              <div>
                <label className={labelClass}>Water Account #</label>
                <input className={inputClass} value={utilityInfo.waterAccount} onChange={e => setUtilityInfo({ ...utilityInfo, waterAccount: e.target.value })} placeholder="Account number" />
              </div>
              <div>
                <label className={labelClass}>Gas Provider</label>
                <input className={inputClass} value={utilityInfo.gas} onChange={e => setUtilityInfo({ ...utilityInfo, gas: e.target.value })} placeholder="e.g. SoCalGas" />
              </div>
              <div>
                <label className={labelClass}>Gas Account #</label>
                <input className={inputClass} value={utilityInfo.gasAccount} onChange={e => setUtilityInfo({ ...utilityInfo, gasAccount: e.target.value })} placeholder="Account number" />
              </div>
              <div>
                <label className={labelClass}>Trash Pickup Day</label>
                <input className={inputClass} value={utilityInfo.trash} onChange={e => setUtilityInfo({ ...utilityInfo, trash: e.target.value })} placeholder="e.g. Every Tuesday" />
              </div>
              <div>
                <label className={labelClass}>Other Utilities</label>
                <input className={inputClass} value={utilityInfo.other} onChange={e => setUtilityInfo({ ...utilityInfo, other: e.target.value })} placeholder="e.g. Internet: Spectrum" />
              </div>
            </div>
          </div>

          {/* Section 9: Amenities */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={sectionTitleClass + " mb-0"}><span>✨</span> Amenities</h2>
              <button type="button" onClick={() => setAmenities([...amenities, { name: "", accessInfo: "" }])} className="text-xs text-[#0f3c52] hover:underline font-medium">+ Add Amenity</button>
            </div>
            {amenities.map((a, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className={inputClass} value={a.name} onChange={e => { const u = [...amenities]; u[i] = { ...u[i], name: e.target.value }; setAmenities(u); }} placeholder="Amenity name (e.g. Pool)" />
                <input className={inputClass} value={a.accessInfo} onChange={e => { const u = [...amenities]; u[i] = { ...u[i], accessInfo: e.target.value }; setAmenities(u); }} placeholder="Access info (e.g. Code 4521)" />
                <button type="button" onClick={() => setAmenities(amenities.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-lg px-1 shrink-0">&times;</button>
              </div>
            ))}
          </div>

          {/* Section 10: Additional Notes */}
          <div className={sectionClass}>
            <h2 className={sectionTitleClass}><span>📝</span> Additional Notes</h2>
            <textarea className={inputClass} rows={4} value={additionalNotes} onChange={e => setAdditionalNotes(e.target.value)} placeholder="Anything else the property manager should know about this property..." />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4">
            <button type="submit" className="bg-[#0f3c52] text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-[#0a2d3e] transition-colors shadow-sm">
              {isUpdate ? "💾 Update Property Info" : "✅ Submit Onboarding"}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center pt-2">
            Your information is securely stored and only shared with your property manager.
          </p>
        </form>
      </div>
    </div>
  );
}

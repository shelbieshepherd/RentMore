import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "~/lib/store";
import { formatCurrency, formatDate, calculateFees, feeConfig, getCancellationGuideline } from "~/lib/data";

export const Route = createFileRoute("/book")({
  component: BookPage,
});

function BookPage() {
  const { properties, bookings, calendarBlocks, addBooking, owners } = useStore();
  const [step, setStep] = useState<"dates" | "results" | "guest" | "confirm">("dates");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const shortTermProps = properties.filter(p => p.type === "short-term");

  const selectedProp = properties.find(p => p.id === selectedProperty);

  const isPropertyAvailable = (propId: string) => {
    if (!checkIn || !checkOut) return false;
    const hasBooking = bookings.some(b =>
      b.propertyId === propId && b.status !== "cancelled" &&
      b.startDate < checkOut && b.endDate > checkIn
    );
    const hasBlock = calendarBlocks.some(b =>
      b.propertyId === propId &&
      b.startDate < checkOut && b.endDate > checkIn
    );
    return !hasBooking && !hasBlock;
  };

  const availableProperties = shortTermProps.filter(p => isPropertyAvailable(p.id));

  const nights = checkIn && checkOut
    ? Math.max(0, Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut) return;
    setStep("results");
  };

  const handleBookProperty = (propId: string) => {
    setSelectedProperty(propId);
    setStep("guest");
  };

  const handleSubmitBooking = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) { alert("Missing property selection"); return; }
    if (!checkIn || !checkOut) { alert("Missing dates"); return; }
    if (!guestName) { alert("Missing guest name"); return; }
    if (!guestEmail) { alert("Missing guest email"); return; }
    const prop = properties.find(p => p.id === selectedProperty);
    const nightlyRate = prop ? Math.round(prop.monthlyRent / 30) : 200;
    const booking = addBooking({
      propertyId: selectedProperty, guestName, guestEmail,
      startDate: checkIn, endDate: checkOut, nightlyRate,
      status: "confirmed", totalAmount: Math.max(0, nights) * nightlyRate,
      source: "direct",
    });

    setStep("confirm");
  };

  const reset = () => {
    setStep("dates"); setCheckIn(""); setCheckOut(""); setSelectedProperty("");
    setGuestName(""); setGuestEmail(""); setGuestPhone("");
    setGuestCount(1); setSpecialRequests("");
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-gray-50 to-blue-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">🏘️</span>
          <div>
            <h1 className="text-lg font-bold" style={{ color: "#0f3c52" }}>RentVue</h1>
            <p className="text-xs text-gray-500">Vacation Rental Booking</p>
          </div>
          <div className="ml-auto text-xs bg-gray-100 px-3 py-1 rounded-full">
            📋 <strong>{bookings.length}</strong> bookings
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {step === "confirm" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">

            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
            <p className="text-gray-500 mb-2">Thank you, {guestName}!</p>

            {nights > 0 && selectedProp && (() => {
                const rate = Math.round(selectedProp.monthlyRent / 30);
                const fees = calculateFees(nights, rate);
                const depositAmount = Math.ceil(nights / 7) * 500;
                const remainderAmount = Math.max(0, fees.total - depositAmount);
                const dueDate = new Date(checkIn);
                dueDate.setDate(dueDate.getDate() - 30);
                const dueDateStr = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return (
                  <>
                    <p className="text-sm font-semibold text-amber-800 bg-amber-50 rounded-lg px-4 py-2 mb-6 inline-block">
                      💳 <strong>{formatCurrency(depositAmount)}</strong> non-refundable deposit due now
                      {remainderAmount > 0 && <> — remaining <strong>{formatCurrency(remainderAmount)}</strong> due by {dueDateStr}</>}
                    </p>
                    <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left space-y-2 max-w-md mx-auto">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Property</span><span className="font-medium">{selectedProp?.name}</span></div>
                      {selectedProp?.ownerId && (() => {
                        const propOwner = owners.find(o => o.id === selectedProp.ownerId);
                        return propOwner ? (
                          <div className="flex justify-between text-sm"><span className="text-gray-500">Owner</span><span className="font-medium">{propOwner.name}</span></div>
                        ) : null;
                      })()}
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Check-in</span><span className="font-medium">{formatDate(checkIn)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Check-out</span><span className="font-medium">{formatDate(checkOut)}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Guests</span><span className="font-medium">{guestCount}</span></div>
                      <div className="border-t pt-2 mt-2 space-y-1">
                        <div className="flex justify-between text-sm"><span className="text-gray-500">{nights} nights × {formatCurrency(rate)}</span><span>{formatCurrency(fees.subtotal)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Cleaning Fee</span><span>{formatCurrency(fees.cleaningFee)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Linen Fee</span><span>{formatCurrency(fees.linenFee)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">NH Tax (8.5%)</span><span>{fees.isTaxExempt ? <span className="text-green-600">Exempt (185+ days)</span> : formatCurrency(fees.tax)}</span></div>
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Mgmt Commission ({(feeConfig.commissionRate * 100)}%)</span><span>{formatCurrency(fees.commission)}</span></div>
                      </div>
                      <div className="flex justify-between text-sm border-t pt-2 font-bold">
                        <span>Total</span>
                        <span>{formatCurrency(fees.total)}</span>
                      </div>
                      <div className="border-t pt-2 mt-2 space-y-1">
                        <div className="flex justify-between text-sm"><span className="text-gray-500">Deposit due now ({Math.ceil(nights / 7)} × $500/week)</span><span className="font-semibold text-amber-700">{formatCurrency(depositAmount)}</span></div>
                        {remainderAmount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Remaining by {dueDateStr}</span><span className="font-semibold">{formatCurrency(remainderAmount)}</span></div>}
                      </div>
                      {selectedProp?.cancellationPolicy && (
                        <div className="border-t pt-3 mt-3">
                          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Cancellation Policy</p>
                          <p className="text-sm font-semibold text-gray-800">{selectedProp.cancellationPolicy}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {selectedProp.cancellationDetails || getCancellationGuideline(selectedProp.cancellationPolicy)}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            <div className="flex gap-3 justify-center">
              <button onClick={reset} className="btn-primary">Book Another Stay</button>
              <button onClick={() => { setTimeout(() => { window.location.href = "/grid?v=" + Date.now(); }, 100); }} className="px-6 py-3 rounded-lg font-semibold text-white" style={{backgroundColor: "#8cc540"}}>View in Grid</button>
            </div>
          </div>
        ) : step === "guest" ? (
          <div className="max-w-lg mx-auto">
            <button onClick={() => setStep("results")} className="text-sm text-gray-500 hover:underline mb-4 inline-block">← Back to results</button>
            <form onSubmit={handleSubmitBooking} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Your Information</h2>
              {selectedProp && (
                <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
                  {selectedProp.image && <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0"><img src={selectedProp.image} alt={selectedProp.name} className="w-full h-full object-cover" /></div>}
                  <div><p className="font-medium text-sm">{selectedProp.name}</p><p className="text-xs text-gray-500">{formatDate(checkIn)} — {formatDate(checkOut)} · {guestCount} guest{guestCount !== 1 ? "s" : ""}</p></div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label><input className="input-field" value={guestName} onChange={e => setGuestName(e.target.value)} required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Email *</label><input className="input-field" type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} required /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input className="input-field" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Guests</label><input className="input-field" type="number" min={1} max={20} value={guestCount} onChange={e => setGuestCount(Number(e.target.value))} /></div>
                <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label><textarea className="input-field min-h-[80px]" value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} /></div>
              </div>
              <button type="submit" className="btn-accent w-full py-3">Confirm Booking</button>
            </form>
          </div>
        ) : step === "results" ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <button onClick={() => setStep("dates")} className="text-sm text-gray-500 hover:underline">← Edit dates</button>
                <h1 className="text-2xl font-bold text-gray-900 mt-1">
                  {availableProperties.length} {availableProperties.length === 1 ? "property" : "properties"} available
                </h1>
              </div>
              <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                {formatDate(checkIn)} — {formatDate(checkOut)} · {nights} night{nights !== 1 ? "s" : ""}
              </div>
            </div>

            {availableProperties.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">No properties available</h2>
                <p className="text-gray-500 mb-6">No properties are available for these dates. Try different dates.</p>
                <button onClick={() => setStep("dates")} className="btn-primary">Edit Dates</button>
              </div>
            ) : (
              <div className="space-y-4">
                {availableProperties.map(prop => {
                  const nightlyRate = Math.round(prop.monthlyRent / 30);
                  return (
                    <div key={prop.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row">
                        {prop.image && (
                          <div className="sm:w-48 h-40 sm:h-auto overflow-hidden bg-gray-100 flex-shrink-0">
                            <img src={prop.image} alt={prop.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="p-4 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-semibold text-gray-900">{prop.name}</h3>
                                <p className="text-sm text-gray-500">{prop.address}</p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-4">
                                <p className="text-lg font-bold" style={{ color: "#0f3c52" }}>{formatCurrency(nightlyRate)}<span className="text-sm font-normal text-gray-400">/night</span></p>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <span className="badge bg-green-100 text-green-800">Available</span>
                              <span className="text-xs text-gray-400">{nights} night{nights !== 1 ? "s" : ""} · {guestCount} guest{guestCount !== 1 ? "s" : ""}</span>
                              {prop.cancellationPolicy && (
                                <span className="text-xs text-gray-500 border border-gray-200 rounded-full px-2 py-0.5">{prop.cancellationPolicy}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                            <span className="text-sm font-semibold">{formatCurrency(nights * nightlyRate)} total</span>
                            <button onClick={() => handleBookProperty(prop.id)} className="btn-accent text-sm">Book Now</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Step 1: Date Search — Hero layout */
          <div className="max-w-lg mx-auto pt-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Find your perfect stay</h1>
              <p className="text-gray-500">Search available properties for your dates</p>
            </div>

            <form onSubmit={handleSearch} className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                  <input type="date" className="input-field text-sm"
                    value={checkIn} onChange={e => setCheckIn(e.target.value)}
                    min={today} required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                  <input type="date" className="input-field text-sm"
                    value={checkOut} onChange={e => setCheckOut(e.target.value)}
                    min={checkIn || today} required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
                <select className="input-field" value={guestCount} onChange={e => setGuestCount(Number(e.target.value))}>
                  {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} guest{n !== 1 ? "s" : ""}</option>)}
                </select>
              </div>
              {nights > 0 && (
                <div className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
                  {nights} night{nights !== 1 ? "s" : ""} stay
                </div>
              )}
              <button type="submit" className="btn-accent w-full py-3 text-base font-semibold">
                Search Availability
              </button>
            </form>
          </div>
        )}

        <footer className="text-center mt-8 text-xs text-gray-400">
          <p>Powered by <span className="font-medium" style={{ color: "#0f3c52" }}>RentVue</span> Property Management</p>
        </footer>
      </main>
    </div>
  );
}
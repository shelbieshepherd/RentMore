import re

with open('listing_temp.tsx', 'r') as f:
    content = f.read()

old = '''        {/* 4. House Rules */}
        {guide?.houseRules && guide.houseRules.length > 0 && (
          <HouseRulesSection rules={guide.houseRules} />
        )}
        {/* 5. Availability Calendar */}
        <AvailabilitySection bookings={bookings} />'''

new = '''        {/* 4. House Rules */}
        {(property.houseRules && property.houseRules.length > 0) && (
          <HouseRulesSection rules={property.houseRules} />
        )}
        {guide?.houseRules && guide.houseRules.length > 0 && !property.houseRules?.length && (
          <HouseRulesSection rules={guide.houseRules} />
        )}
        {/* 4b. Cancellation Policy */}
        {property.cancellationPolicy && (
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">📜 Cancellation Policy</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <p className="font-semibold text-gray-900">{property.cancellationPolicy}</p>
              <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">
                {property.cancellationDetails || getCancellationGuideline(property.cancellationPolicy)}
              </p>
            </div>
          </section>
        )}
        {/* 5. Availability Calendar */}
        <AvailabilitySection bookings={bookings} />'''

if old in content:
    content = content.replace(old, new)
    with open('listing_temp.tsx', 'w') as f:
        f.write(content)
    print("PATCH OK")
else:
    print("NOT FOUND - trying with different whitespace")
    # Show the actual content around that area
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '4. House Rules' in line or '5. Availability' in line:
            print(f"{i}: {repr(line)}")

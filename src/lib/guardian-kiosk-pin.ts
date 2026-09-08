export function defaultGuardianPinFromPhone(_phone: unknown) {
  void _phone;
  return "";
}

export function defaultGuardianPinUpdate({
  guardianId,
  phone,
  setById,
  now = new Date(),
}: {
  guardianId: string;
  phone: unknown;
  setById: string;
  now?: Date;
}) {
  void guardianId;
  void phone;
  void setById;
  void now;
  return null;
}

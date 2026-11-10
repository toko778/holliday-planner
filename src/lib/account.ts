export const interests = ['მთა', 'ზღვა', 'ლაშქრობა', 'კულტურა', 'გასტრონომია', 'სიმშვიდე']

export type AccountMode = 'register' | 'login' | 'reset' | 'new-password'

export interface AccountFields {
  name: string
  email: string
  password: string
  confirmation: string
}

export function validateAccount(mode: AccountMode, fields: AccountFields) {
  const errors: Partial<Record<keyof AccountFields, string>> = {}

  if (mode === 'register' && fields.name.trim().length < 2) {
    errors.name = 'სახელი უნდა შეიცავდეს მინიმუმ 2 სიმბოლოს.'
  }
  if (mode !== 'new-password' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    errors.email = 'მიუთითე ელფოსტის სწორი მისამართი.'
  }
  if (mode !== 'reset' && !fields.password) {
    errors.password = 'შეიყვანე პაროლი.'
  } else if ((mode === 'register' || mode === 'new-password') && fields.password.length < 8) {
    errors.password = 'გამოიყენე მინიმუმ 8 სიმბოლო.'
  }
  if ((mode === 'register' || mode === 'new-password') && fields.confirmation !== fields.password) {
    errors.confirmation = 'პაროლები ერთმანეთს უნდა ემთხვეოდეს.'
  }

  return errors
}

export function accountError(error: { code?: string }) {
  switch (error.code) {
    case 'invalid_credentials': return 'ელფოსტა ან პაროლი არასწორია. გადაამოწმე და სცადე ხელახლა.'
    case 'email_not_confirmed': return 'შესვლამდე დაადასტურე ელფოსტა მიღებული წერილის ბმულით.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit': return 'მოთხოვნების ლიმიტი ამოიწურა. ცოტა ხანში სცადე ხელახლა.'
    case 'weak_password': return 'აირჩიე უფრო ძლიერი პაროლი. გამოიყენე ასოები, ციფრები და სპეციალური სიმბოლოები.'
    default: return 'მოქმედება ვერ დასრულდა. გადაამოწმე კავშირი და სცადე ხელახლა.'
  }
}

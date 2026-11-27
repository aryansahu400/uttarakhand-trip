export const PEOPLE = ["Aryan", "Krish", "Tejas", "Anshul", "Shlok", "Sarthak", "Krishnam", "Riya", "Rashi", "Amisha"] as const;

/** Admin: can delete any entry and manage who can sign in. */
export const ADMIN_PERSON = "Aryan";

/** Only the person who added an entry, or the admin, may delete it. Entries with no owner: admin only. */
export const canDelete = (me: { person: string; isAdmin: boolean }, createdBy: string | null | undefined) =>
  me.isAdmin || (!!createdBy && createdBy === me.person);

export type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    updated: string;
    duedate: string;
    status: {
      name: string;
    };
  };
};

export type SelectOption = {
  label: string;
  value: string;
};

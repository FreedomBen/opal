opal_filter "String subclasses" do
  fails "String#upcase returns a subclass instance for subclasses"
  fails "String#swapcase returns subclass instances when called on a subclass"
  fails "String#downcase returns a subclass instance for subclasses"
  fails "String#capitalize returns subclass instances when called on a subclass"
  fails "String#center with length, padding returns subclass instances when called on subclasses"
  fails "String#chomp when passed no argument returns subclass instances when called on a subclass"
  fails "String#chop returns subclass instances when called on a subclass"
  fails "String#dup calls #initialize_copy on the new instance"
  fails "String#dup copies instance variables"
  fails "String#dup does not copy singleton methods"
  fails "String#dup does not copy modules included in the singleton class"
  fails "String#gsub with pattern and replacement returns subclass instances when called on a subclass"
  fails "String#index with Regexp returns the index of the first match of regexp"
  fails "String#index with Regexp starts the search at the given offset"
  fails "String#index with Regexp supports \G which matches at the given start offset"
  fails "String#ljust with length, padding returns subclass instances when called on subclasses"
  fails "String#next returns subclass instances when called on a subclass"
  fails "String#rjust with length, padding returns subclass instances when called on subclasses"
  fails "String#squeeze returns subclass instances when called on a subclass"
  fails "String#sub with pattern, replacement returns subclass instances when called on a subclass"
  fails "String#succ returns subclass instances when called on a subclass"
  fails "String#tr returns subclass instances when called on a subclass"
  fails "String#tr_s returns subclass instances when called on a subclass"
end